import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CCXTProvider } from "@/lib/providers/market/CCXTProvider";
import { AlpacaProvider } from "@/lib/providers/market/AlpacaProvider";
import { IndicatorEngine } from "@/lib/engines/IndicatorEngine";
import { MarketStructureEngine } from "@/lib/engines/MarketStructureEngine";
import { StrategyEngine } from "@/lib/strategy/StrategyEngine";
import { analyze } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.symbol || body.symbol === "Auto-Detecting...") {
      return NextResponse.json({ error: "Trading symbol is required for API mode." }, { status: 400 });
    }

    if (!body.activeConnectionId) {
      return NextResponse.json({ error: "An active exchange connection is required for API mode." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: conn, error: connectionError } = await supabase
      .from("exchange_keys")
      .select("*")
      .eq("id", body.activeConnectionId)
      .eq("user_id", user.id)
      .single();

    if (connectionError || !conn) {
      return NextResponse.json({ error: "Exchange connection not found." }, { status: 404 });
    }

    if (!conn.is_active) {
      return NextResponse.json({ error: "Exchange connection is inactive." }, { status: 400 });
    }

    const exchangeName = String(conn.exchange).toLowerCase();
    const apiKey = conn.api_key;
    const apiSecret = conn.api_secret;
    const environment = conn.environment;
    const passphrase = conn.passphrase;

    // Dynamically import CoinDCXProvider to avoid bundle issues if not used
    const { CoinDCXProvider } = await import("@/lib/providers/market/CoinDCXProvider");

    // API DATA MODE ONLY. No screenshots or visual extraction are used here.
    let provider;
    if (exchangeName === "alpaca") {
      provider = new AlpacaProvider(apiKey, apiSecret);
    } else if (exchangeName === "coindcx" || exchangeName === "coincdx") {
      provider = new CoinDCXProvider(apiKey, apiSecret);
    } else {
      provider = new CCXTProvider(exchangeName, apiKey, apiSecret, passphrase, environment);
    }

    if (exchangeName === "alpaca") {
      await (provider as AlpacaProvider).testConnection();
    } else if (exchangeName === "coindcx" || exchangeName === "coincdx") {
      await (provider as CoinDCXProvider).testConnection();
    }

    const primaryTimeframe = body.timeframe || "5m";

    const [ohlcvResult, tickerResult] = await Promise.allSettled([
      provider.fetchOHLCV(body.symbol, primaryTimeframe, 100),
      provider.fetchTicker(body.symbol),
    ]);

    if (ohlcvResult.status === "rejected" || tickerResult.status === "rejected") {
      const reason = ohlcvResult.status === "rejected"
        ? (ohlcvResult as any).reason?.message
        : (tickerResult as any).reason?.message;
      throw new Error(reason || "Failed to fetch market data from the exchange.");
    }

    const ohlcv = ohlcvResult.value;
    const ticker = tickerResult.value;

    if (!ohlcv || ohlcv.length < 50) {
      return NextResponse.json({
        error: `Insufficient historical data for ${body.symbol} on ${exchangeName}. Received ${ohlcv?.length || 0} candles, but at least 50 are required.`
      }, { status: 400 });
    }

    // Deterministic calculations happen in backend code. AI interprets them.
    const indData = IndicatorEngine.calculate(ohlcv);
    if (!indData?.latest) {
      return NextResponse.json({ error: "Unable to calculate market indicators." }, { status: 400 });
    }

    const marketRegime = MarketStructureEngine.determineRegime(ohlcv, indData.latest);
    const swings = MarketStructureEngine.findSwings(ohlcv);

    const marketData = {
      symbol: body.symbol,
      timeframe: primaryTimeframe,
      dataSource: "api",
      lastPrice: ticker.last,
      recentCandles: ohlcv.slice(-10),
      indicators: indData.latest,
      indicatorSeries: {
        rsi: indData.series.rsi14.slice(-10),
        macd: indData.series.macd.slice(-10),
        bb: indData.series.bb.slice(-10),
        atr: indData.series.atr.slice(-10),
      },
      marketRegime,
      swings,
    };

    const strategyStr = body.selectedStrategies?.length
      ? body.selectedStrategies.join(", ")
      : body.strategy;

    const strategyRules = StrategyEngine.getStrategyRules(
      strategyStr as any,
      body.platform,
      body.tradeDuration,
      "api"
    ).rules;

    // Text-only AI reasoning. No imageBase64/screenshots are supplied.
    const analyzeReq = {
      ...body,
      imageBase64: undefined,
      screenshots: [],
      macroTimeframeImage: undefined,
      confirmationTimeframeImage: undefined,
      structureTimeframeImage: undefined,
      isProgressive: false,
      marketDataMode: "api",
      marketData,
      strategyRules,
    };

    const result = await analyze(analyzeReq as any);

    const marketProvider = exchangeName === "alpaca" ? "broker_api" : "ccxt";

    const finalResponse = {
      ...result,
      tradeDuration: body.tradeDuration,
      marketDataMode: "api",
      marketProvider,
      exchange: exchangeName,
      marketDataStatus: "available",
      unifiedMarketData: {
        ...(result.unifiedMarketData || {}),
        symbol: body.symbol,
        timeframe: primaryTimeframe,
        currentPrice: {
          value: ticker.last,
          source: "api",
          confidence: 100,
        },
        completedCandle: {
          value: ohlcv[ohlcv.length - 2] || null,
          source: "api",
          confidence: 100,
        },
        currentIncompleteCandle: {
          value: ohlcv[ohlcv.length - 1] || null,
          source: "api",
          confidence: 100,
        },
        volume: {
          value: ticker.volume ?? ohlcv[ohlcv.length - 1]?.volume ?? null,
          source: "api",
          confidence: 100,
        },
        indicators: {
          ...(result.unifiedMarketData?.indicators || {}),
          RSI: {
            value: indData.latest.rsi ?? null,
            source: "api",
            confidence: 100,
          },
          MACD: {
            value: indData.latest.macd ?? null,
            source: "api",
            confidence: 100,
          },
          BollingerBands: {
            value: indData.latest.bb ?? null,
            source: "api",
            confidence: 100,
          },
          ATR: {
            value: indData.latest.atr ?? null,
            source: "api",
            confidence: 100,
          },
        },
        marketStructure: {
          value: marketRegime,
          source: "api",
          confidence: 100,
        },
        trend: {
          value: marketRegime,
          source: "api",
          confidence: 100,
        },
        supportLevels: {
          value: swings.swingLows,
          source: "api",
          confidence: 100,
        },
        resistanceLevels: {
          value: swings.swingHighs,
          source: "api",
          confidence: 100,
        },
      },
      analysisType: "api",
      extractionOnly: false,
    };

    if (user.id) {
      await supabase.from("trade_analyses").insert({
        user_id: user.id,
        provider_version: body.provider || "default",
        symbol: body.symbol,
        timeframe: primaryTimeframe,
        market_data: marketData,
        indicators: indData.latest,
        market_regime: marketRegime,
        signal: result.signal,
        confidence: result.confidence,
        reason: result.explanation,
        exchange: exchangeName,
        market_provider: marketProvider,
        market_data_mode: "api",
        market_data_status: "available",
        data_timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(finalResponse);
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || "Failed to analyze API data",
      analysisType: "api",
      marketDataMode: "api",
    }, { status: 500 });
  }
}
