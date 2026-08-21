import { RiskEngine } from '@/lib/engines/RiskEngine';
import { NextRequest, NextResponse } from "next/server";

import { analyze } from "@/lib/ai";
import { AnalyzeRequest, TradingAnalysis } from "@/lib/types";

type AnalysisTimings = {
  validationMs: number;
  marketDataMs: number;
  indicatorMs: number;
  aiMs: number;
  storageMs: number;
  databaseMs: number;
  totalMs: number;
};

type MarketAnalysisContext = {
  marketData: any;
  indicators: any;
  marketRegime: any;
  swings: any;
  exchange: string;
  marketProvider: string;
  marketDataStatus: string;
  dataTimestamp: number;
  dataAge: number;
  primaryTimeframe: string;
  confirmationTimeframe?: string;
  trendTimeframe?: string;
  strategyRules?: any;
};

function createTimings(): AnalysisTimings {
  return {
    validationMs: 0,
    marketDataMs: 0,
    indicatorMs: 0,
    aiMs: 0,
    storageMs: 0,
    databaseMs: 0,
    totalMs: 0,
  };
}

function validateRequest(body: any) {
  if (!body.imageBase64 && (!body.screenshots || body.screenshots.length === 0)) {
    return NextResponse.json(
      { error: "Image(s) are required" },
      { status: 400 }
    );
  }

  if (!body.symbol || body.symbol === "Auto-Detecting...") {
    return NextResponse.json(
      {
        error:
          "Trading symbol is required for exact market data fetching.",
      },
      { status: 400 }
    );
  }

  if (!body.timeframe || body.timeframe === "Auto-Detecting...") {
    return NextResponse.json(
      {
        error:
          "Timeframe is required for exact market data fetching.",
      },
      { status: 400 }
    );
  }

  return null;
}

function resolveMarketMode(body: AnalyzeRequest) {
  return body.marketDataMode || "api";
}

function resolveMTFTimeframes(
  body: AnalyzeRequest
): {
  confirmationTimeframe?: string;
  trendTimeframe?: string;
} {
  let confirmationTimeframe = body.confirmationTimeframe;
  let trendTimeframe = body.trendTimeframe;

  if (!confirmationTimeframe) {
    const strategies = (body as any).selectedStrategies || [];
    const strategy = strategies.length > 0 ? strategies[0] : (body as any).strategy || "Trend Following";
    const primaryTimeframe = body.timeframe;

    if (strategy === "Scalping") {
      confirmationTimeframe = "15m";
      trendTimeframe = "1h";
    } else if (strategy === "Trend Following") {
      confirmationTimeframe = "1h";
      trendTimeframe = "4h";
    } else if (strategy === "Swing") {
      confirmationTimeframe = "4h";
      trendTimeframe = "1d";
    } else {
      confirmationTimeframe =
        primaryTimeframe === "1m"
          ? "5m"
          : primaryTimeframe === "5m"
            ? "15m"
            : "1h";

      trendTimeframe =
        primaryTimeframe === "1m"
          ? "15m"
          : primaryTimeframe === "5m"
            ? "1h"
            : "4h";
    }
  }

  return {
    confirmationTimeframe,
    trendTimeframe,
  };
}

async function fetchMarketData(
  body: AnalyzeRequest,
  mode: string,
  primaryTimeframe: string,
  confirmationTimeframe?: string,
  trendTimeframe?: string,
  supabase?: any,
  userId?: string
): Promise<{
  marketData: any;
  indicators: any;
  marketRegime: any;
  swings: any;
  exchange: string;
  marketProvider: string;
  marketDataStatus: string;
  dataTimestamp: number;
  dataAge: number;
}> {
  let marketData = null;
  let indicators = null;
  let marketRegime = null;
  let swings = null;

  let exchange = "unknown";
  let marketProvider = "binance";
  let marketDataStatus = "not_requested";

  let dataTimestamp = Date.now();
  let dataAge = 0;

  /*
   * VISUAL ONLY
   *
   * Important:
   * Do not call CCXT.
   * Do not attempt market-data lookup.
   */
  if (mode === "visual_only") {
    return {
      marketData,
      indicators,
      marketRegime,
      swings,
      exchange,
      marketProvider: "visual_only",
      marketDataStatus: "not_requested",
      dataTimestamp,
      dataAge,
    };
  }

  try {
    const { CCXTProvider } = await import(
      "@/lib/providers/market/CCXTProvider"
    );

    const { IndicatorEngine } = await import(
      "@/lib/engines/IndicatorEngine"
    );

    const { MarketStructureEngine } = await import(
      "@/lib/engines/MarketStructureEngine"
    );

    let exchangeName = "binance";
    let apiKey = undefined;
    let apiSecret = undefined;

    if (body.activeConnectionId && supabase && userId) {
      const { data: conn } = await supabase
        .from("exchange_keys")
        .select("*")
        .eq("id", body.activeConnectionId)
        .eq("user_id", userId)
        .single();
      
      if (conn) {
        exchangeName = conn.exchange;
        apiKey = conn.api_key;
        apiSecret = conn.api_secret;
      }
    }

    const provider = new CCXTProvider(exchangeName, apiKey, apiSecret);

    exchange = exchangeName;
    marketProvider = "ccxt";
    marketDataStatus = "available";

    /*
     * Fetch all independent market data concurrently.
     */
    const symbol = body.symbol!;
    const [
      ohlcvResult,
      tickerResult,
      ohlcvConfResult,
      ohlcvTrendResult,
    ] = await Promise.allSettled([
      provider.fetchOHLCV(
        symbol,
        primaryTimeframe,
        200
      ),

      provider.fetchTicker(symbol),

      confirmationTimeframe &&
      confirmationTimeframe !== primaryTimeframe
        ? provider.fetchOHLCV(
            symbol,
            confirmationTimeframe,
            50
          )
        : Promise.resolve(null),

      trendTimeframe &&
      trendTimeframe !== primaryTimeframe &&
      trendTimeframe !== confirmationTimeframe
        ? provider.fetchOHLCV(
            symbol,
            trendTimeframe,
            50
          )
        : Promise.resolve(null),
    ]);

    /*
     * Primary OHLCV is mandatory for API analysis.
     */
    if (ohlcvResult.status === "rejected") {
      throw new Error(
        ohlcvResult.reason?.message ||
          "Failed to fetch primary OHLCV"
      );
    }

    const ohlcv = ohlcvResult.value;

    const ticker =
      tickerResult.status === "fulfilled"
        ? tickerResult.value
        : { last: 0 };

    /*
     * Data timestamp / freshness.
     */
    if (ohlcv.length > 0) {
      dataTimestamp =
        (ohlcv[ohlcv.length - 1] as any).openTime ||
        Date.now();

      dataAge = Math.floor(
        (Date.now() - dataTimestamp) / 1000
      );
    }

    /*
     * Primary indicator calculation.
     */
    const indData =
      IndicatorEngine.calculate(ohlcv);

    marketData = {
      lastPrice: ticker.last,
      recentCandles: ohlcv.slice(-5),
      multiTimeframe: {} as Record<string, any>,
    };

    if (indData) {
      indicators = indData.latest;

      marketRegime =
        MarketStructureEngine.determineRegime(
          ohlcv,
          indicators
        );

      swings =
        MarketStructureEngine.findSwings(
          ohlcv
        );
    }

    /*
     * Confirmation timeframe.
     */
    if (
      ohlcvConfResult.status === "fulfilled" &&
      ohlcvConfResult.value
    ) {
      const indConf =
        IndicatorEngine.calculate(
          ohlcvConfResult.value
        );

      marketData.multiTimeframe[
        `${confirmationTimeframe}_regime`
      ] =
        MarketStructureEngine.determineRegime(
          ohlcvConfResult.value,
          indConf?.latest
        );
    }

    /*
     * Trend timeframe.
     */
    if (
      ohlcvTrendResult.status === "fulfilled" &&
      ohlcvTrendResult.value
    ) {
      const indTrend =
        IndicatorEngine.calculate(
          ohlcvTrendResult.value
        );

      marketData.multiTimeframe[
        `${trendTimeframe}_regime`
      ] =
        MarketStructureEngine.determineRegime(
          ohlcvTrendResult.value,
          indTrend?.latest
        );
    }

    return {
      marketData,
      indicators,
      marketRegime,
      swings,
      exchange,
      marketProvider,
      marketDataStatus,
      dataTimestamp,
      dataAge,
    };
  } catch (error: any) {
    /*
     * Preserve existing behavior:
     * CCXT failure → visual_only fallback.
     */
    console.warn(
      "Failed to fetch exact market data from CCXT (Symbol might be OTC or invalid):",
      error?.message || error
    );

    return {
      marketData: null,
      indicators: null,
      marketRegime: null,
      swings: null,
      exchange: "unknown",
      marketProvider: "visual_only",
      marketDataStatus: "unavailable",
      dataTimestamp: Date.now(),
      dataAge: 0,
    };
  }
}

async function getStrategyRules(
  strategy?: string,
  platform?: string,
  tradeDuration?: string,
  marketDataMode?: string
) {
  if (!strategy) {
    return undefined;
  }

  const { StrategyEngine } = await import(
    "@/lib/strategy/StrategyEngine"
  );

  return StrategyEngine.getStrategyRules(
    strategy as any,
    platform,
    tradeDuration,
    marketDataMode
  ).rules;
}

async function createSupabaseClient() {
  const { createClient } = await import(
    "@/lib/supabase/server"
  );

  return createClient();
}

async function uploadScreenshot(
  supabase: any,
  userId: string | undefined,
  imageBase64?: string
): Promise<string | null> {
  if (!userId || !imageBase64) {
    return null;
  }

  try {
    const base64Data = imageBase64.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    const buffer = Buffer.from(
      base64Data,
      "base64"
    );

    const filename = `analyses/${userId}/${Date.now()}.png`;

    const { data } =
      await supabase.storage
        .from("screenshots")
        .upload(filename, buffer, {
          contentType: "image/png",
        });

    if (!data) {
      return null;
    }

    return supabase.storage
      .from("screenshots")
      .getPublicUrl(data.path)
      .data.publicUrl;
  } catch (error) {
    console.error(
      "Storage upload failed:",
      error
    );

    return null;
  }
}

async function getRiskConfiguration(
  supabase: any,
  userId: string
) {
  const { data: profile } =
    await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

  const riskConfig = {
    minimumRiskReward:
      profile?.minimum_risk_reward || 2.0,

    maxDailyLoss:
      profile?.max_daily_loss || 5.0,

    maxOpenPositions:
      profile?.max_open_positions || 3,

    maxConsecutiveLosses: 3,

    staleDataThresholdSeconds: 300,
  };

  const accountState = {
    currentDailyLoss: 0,
    openPositionsCount: 0,
    consecutiveLosses: 0,
    inCooldown: false,
  };

  return {
    profile,
    riskConfig,
    accountState,
  };
}

async function persistAnalysis(supabase: any, userId: string, body: any, result: any, context: any, screenshotUrl: string | null, tradingMode: string) {
  try {
    const {
      marketData,
      indicators,
      marketRegime,
      exchange,
      marketProvider,
      marketDataStatus,
      dataTimestamp,
      dataAge,
      primaryTimeframe,
      confirmationTimeframe,
      trendTimeframe,
    } = context;

    const { data: analysis } =
      await supabase
        .from("analyses")
        .insert({
          user_id: userId,
          prompt_version: "v3",
          strategy_version:
            (body as any).strategy || (body.selectedStrategies ? body.selectedStrategies.join(",") : "Standard"),
          indicator_version: "v2",
          ai_model_version:
            body.model || "default",
          provider_version:
            body.provider || "default",
          symbol: body.symbol,
          timeframe: body.timeframe,
          screenshot_url: screenshotUrl,
          market_data: marketData,
          indicators,
          market_regime: marketRegime,
          signal: result.signal,
          confidence: result.confidence,
          reason: result.explanation,
          exchange,
          market_provider: marketProvider,
          market_data_mode:
            body.marketDataMode || "api",
          market_data_status:
            marketDataStatus,
          data_timestamp:
            dataTimestamp > 0
              ? new Date(
                  dataTimestamp
                ).toISOString()
              : null,
          data_age: dataAge,
          primary_timeframe:
            primaryTimeframe,
          confirmation_timeframe:
            confirmationTimeframe,
          trend_timeframe:
            trendTimeframe,
          risk_decision:
            result.riskDecision,
        })
        .select()
        .single();

    if (
      !analysis ||
      !(
        result.signal === "BUY" ||
        result.signal === "SELL"
      )
    ) {
      return;
    }
    /*
     * NOTE:
     * The existing implementation obtains capital/risk
     * from profile directly. We preserve that behavior below.
     */
    const { data: profile } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

    const calculatedPositionSize =
      RiskEngine.calculatePositionSize(
        profile?.capital || 10000,
        profile?.risk_percent || 1,
        result.entryPrice || 0,
        result.stopLoss || 0
      );

    let tradeStatus = "OPEN";

    /*
     * Preserve existing LIVE execution behavior.
     */
    if (tradingMode === "LIVE") {
      try {
        const { data: exchangeKeys } = await supabase
          .from("exchange_keys")
          .select("*")
          .eq("user_id", userId)
          .in("exchange", ["binance", "binance_testnet"]);

        // If they have demo keys saved, prioritize them, else use mainnet
        const keys = exchangeKeys?.find((k: any) => k.exchange === "binance_testnet") || exchangeKeys?.find((k: any) => k.exchange === "binance");

        if (
          keys &&
          keys.api_key &&
          keys.api_secret
        ) {
          const {
            LiveExecutionProvider,
          } = await import(
            "@/lib/providers/execution/LiveExecutionProvider"
          );

          const liveProvider =
            new LiveExecutionProvider(
              keys.exchange,
              keys.api_key,
              keys.api_secret,
              keys.api_passphrase
            );

          await liveProvider.connect();

          const liveResult =
            await liveProvider.executeTrade(
              body.symbol!,
              result as any,
              calculatedPositionSize
            );

          tradeStatus = liveResult.status;
        }
      } catch (error) {
        console.error(
          "Live Execution Failed:",
          error
        );

        tradeStatus = "RISK_REJECTED";
      }
    }

    const { data: insertedTrade } = await supabase
      .from("trades")
      .insert({
        user_id: userId,
        analysis_id: analysis.id,
        entry_price: result.entryPrice,
        stop_loss: result.stopLoss,
        take_profit: result.takeProfit,
        risk_reward_ratio:
          result.riskReward,
        position_size:
          calculatedPositionSize,
        execution_mode: tradingMode,
        status: tradeStatus,
      })
      .select()
      .single();

    if (insertedTrade) {
      (result as any).dbTradeId = insertedTrade.id;
    }
  } catch (error) {
    console.error(
      "Failed to journal trade to Supabase:",
      error
    );
  }
}

async function runRiskValidation(
  result: TradingAnalysis,
  supabase: any,
  userId: string | null,
  platform?: string
) {
  const { RiskEngine } = await import(
    "@/lib/engines/RiskEngine"
  );

  if (userId) {
    const {
      riskConfig,
      accountState,
    } = await getRiskConfiguration(
      supabase,
      userId
    );

    return RiskEngine.validate(
      result,
      riskConfig,
      accountState,
      platform
    );
  }

  return RiskEngine.validate(
    result,
    {
      minimumRiskReward: 2.0,
      maxDailyLoss: 5,
      maxOpenPositions: 3,
      maxConsecutiveLosses: 3,
      staleDataThresholdSeconds: 300,
    },
    {
      currentDailyLoss: 0,
      openPositionsCount: 0,
      consecutiveLosses: 0,
      inCooldown: false,
    },
    platform
  );
}

export async function POST(
  req: NextRequest
) {
  const t0 = performance.now();

  const timings = createTimings();

  try {
    /*
     * ==========================================
     * 1. REQUEST VALIDATION
     * ==========================================
     */

    const body =
      (await req.json()) as AnalyzeRequest;

    if (body.useDualModel && !body.isProgressive && body.reasoningProvider && body.reasoningModel) {
      body.provider = body.reasoningProvider;
      body.model = body.reasoningModel;
    }
    
    try {
      const logData = `\n\n[${new Date().toISOString()}] === INCOMING ANALYZE REQUEST ===\n${JSON.stringify({...body, imageBase64: body.imageBase64 ? "base64..." : undefined, screenshots: body.screenshots ? `Array(${body.screenshots.length})` : undefined}, null, 2)}`;
    } catch (e) {
      console.error("Failed to write log", e);
    }

    const validationError =
      validateRequest(body);

    if (validationError) {
      return validationError;
    }

    if (!body.symbol || !body.timeframe) {
      return NextResponse.json(
        { error: "Symbol and timeframe are required" },
        { status: 400 }
      );
    }

    timings.validationMs =
      performance.now() - t0;

    /*
     * ==========================================
     * 2. SUPABASE + USER
     * ==========================================
     */
    const supabase = await createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    /*
     * ==========================================
     * 3. MARKET DATA
     * ==========================================
     */

    const mode = resolveMarketMode(body);
    const primaryTimeframe = body.timeframe;
    const { confirmationTimeframe, trendTimeframe } = resolveMTFTimeframes(body);

    const tMarketStart = performance.now();

    const marketContext = await fetchMarketData(
      body,
      mode,
      primaryTimeframe,
      confirmationTimeframe,
      trendTimeframe,
      supabase,
      user?.id
    );

    timings.marketDataMs =
      performance.now() -
      tMarketStart;

    /*
     * ==========================================
     * 4. STRATEGY RULES
     * ==========================================
     */

    const tIndicatorStart = performance.now();

    const strategyStr = body.selectedStrategies ? body.selectedStrategies.join(", ") : (body as any).strategy;
    const strategyRules = await getStrategyRules(
      strategyStr,
      body.platform,
      body.tradeDuration,
      body.marketDataMode
    );

    timings.indicatorMs = performance.now() - tIndicatorStart;

    /*
     * ==========================================
     * 5. AI ANALYSIS
     * ==========================================
     */

    const tAiStart =
      performance.now();

    const aiPromise = analyze({
      imageBase64: body.imageBase64,
      screenshots: (body as any).screenshots,
      symbol: body.symbol,
      timeframe: body.timeframe,
      platform: body.platform,
      tradeDuration: body.tradeDuration,
      provider: body.provider || "gemini",
      useDualModel: body.useDualModel,
      reasoningProvider: body.reasoningProvider,
      reasoningModel: body.reasoningModel,
      visibleIndicators: body.visibleIndicators,
      selectedStrategies: body.selectedStrategies,
      model: body.model,
      isProgressive: body.isProgressive,
      progressiveState: body.progressiveState,
      marketData:
        marketContext.marketProvider === "visual_only"
          ? undefined
          : {
              ...marketContext.marketData,
              indicators: marketContext.indicators,
              marketRegime: marketContext.marketRegime,
              swings: marketContext.swings,
            },
      strategyRules,
      previousData: body.previousData,
      macroTimeframe: body.macroTimeframeImage,
      confirmationTimeframeImage: body.confirmationTimeframeImage,
      structureTimeframe: body.structureTimeframeImage,
      primaryTimeframe: body.primaryTimeframe,
    } as any);

    /*
     * ==========================================
     * 6. SCREENSHOT STORAGE
     * ==========================================
     */

    const tStorageStart =
      performance.now();

    const screenshotToUpload = body.imageBase64 || ((body as any).screenshots && (body as any).screenshots.length > 0 ? (body as any).screenshots[(body as any).screenshots.length - 1].base64 : undefined);
    
    const screenshotUrlPromise = Promise.resolve(null);

    /*
     * AI + screenshot upload continue
     * concurrently.
     */
    const [
      result,
      screenshotUrl,
    ] = await Promise.all([
      aiPromise,
      screenshotUrlPromise,
    ]);

    timings.aiMs =
      performance.now() -
      tAiStart;

    timings.storageMs =
      performance.now() -
      tStorageStart;

    /*
     * ==========================================
     * 7. ATTACH MARKET METADATA
     * ==========================================
     */

    const enrichedResult = result as any;

    enrichedResult.exchange =
      marketContext.exchange;

    enrichedResult.marketProvider =
      marketContext.marketProvider;

    enrichedResult.dataTimestamp =
      marketContext.dataTimestamp;

    enrichedResult.dataAge =
      marketContext.dataAge;

    enrichedResult.primaryTimeframe =
      primaryTimeframe;

    enrichedResult.confirmationTimeframe =
      confirmationTimeframe;

    enrichedResult.trendTimeframe =
      trendTimeframe;

    enrichedResult.marketDataMode = mode as any;
    
    enrichedResult.tradeDuration = body.tradeDuration;

    /*
     * ==========================================
     * 8. RISK ENGINE
     * ==========================================
     */

    const riskValidatedResult =
      await runRiskValidation(
        enrichedResult,
        supabase,
        user?.id || null,
        body.platform
      );

    /*
     * ==========================================
     * 9. DATABASE PERSISTENCE
     * ==========================================
     */

    if (user) {
      const {
        data: profile,
      } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

      const tradingMode =
        body.tradingMode ||
        profile?.trading_mode ||
        "MANUAL";

      if (body.tradingMode && body.tradingMode !== profile?.trading_mode) {
        await supabase.from("profiles").update({ trading_mode: body.tradingMode }).eq("id", user.id);
      }

      const tDbStart =
        performance.now();

      /*
       * Preserve existing fire-and-forget
       * persistence behavior.
       */
      if (!body.isProgressive) {
        persistAnalysis(
          supabase,
          user.id,
          body,
          riskValidatedResult,
          {
            ...marketContext,
            primaryTimeframe,
            confirmationTimeframe,
            trendTimeframe,
            strategyRules,
          },
          screenshotUrl,
          tradingMode
        );
      }

      timings.databaseMs =
        performance.now() - tDbStart;
    }

    /*
     * ==========================================
     * 10. FINAL RESPONSE
     * ==========================================
     */

    timings.totalMs =
      performance.now() - t0;

    (
      riskValidatedResult as any
    ).timings = timings;

    (
      riskValidatedResult as any
    ).marketDataMode = mode;

    (
      riskValidatedResult as any
    ).marketDataStatus =
      marketContext.marketDataStatus;

    return NextResponse.json(
      riskValidatedResult
    );
  } catch (error: any) {
    console.error(
      "AI Analysis API Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

