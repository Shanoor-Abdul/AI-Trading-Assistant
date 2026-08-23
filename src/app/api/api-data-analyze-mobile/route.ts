import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CCXTProvider } from "@/lib/providers/market/CCXTProvider";
import { IndicatorEngine } from "@/lib/engines/IndicatorEngine";
import { MarketStructureEngine } from "@/lib/engines/MarketStructureEngine";
import { StrategyEngine } from "@/lib/strategy/StrategyEngine";
import { analyze } from "@/lib/ai";
import { buildApiDataMobilePrompt } from "@/lib/ai/apiDataMobilePrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.symbol || body.symbol === "Auto-Detecting...") {
      return NextResponse.json({ error: "Trading symbol is required for API mode." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!body.activeConnectionId) {
      return NextResponse.json({ error: "activeConnectionId is required." }, { status: 400 });
    }

    const { data: conn, error: connError } = await supabase
      .from("exchange_keys")
      .select("*")
      .eq("id", body.activeConnectionId)
      .eq("user_id", user.id)
      .single();

    if (connError || !conn) {
      return NextResponse.json({ error: "Exchange connection not found." }, { status: 404 });
    }

    const timeframe = body.timeframe || "5m";
    const provider = new CCXTProvider(
      conn.exchange,
      conn.api_key,
      conn.api_secret,
      conn.passphrase,
      conn.environment,
    );

    const [ohlcvResult, tickerResult] = await Promise.allSettled([
      provider.fetchOHLCV(body.symbol, timeframe, 100),
      provider.fetchTicker(body.symbol),
    ]);

    if (ohlcvResult.status === "rejected" || tickerResult.status === "rejected") {
      throw new Error("Failed to fetch market data from the exchange.");
    }

    const ohlcv = ohlcvResult.value;
    const ticker = tickerResult.value;
    if (!ohlcv || ohlcv.length < 50) {
      return NextResponse.json({
        error: `Insufficient historical data. Received ${ohlcv?.length || 0} candles; at least 50 are required.`,
      }, { status: 400 });
    }

    const indicatorData = IndicatorEngine.calculate(ohlcv);
    const latestIndicators = indicatorData?.latest;
    const marketRegime = MarketStructureEngine.determineRegime(ohlcv, latestIndicators);
    const swings = MarketStructureEngine.findSwings(ohlcv);

    const recentCandles = ohlcv.slice(-20);
    const marketData = {
      symbol: body.symbol,
      timeframe,
      lastPrice: ticker.last,
      recentCandles,
      indicators: latestIndicators,
      marketRegime,
      swings,
      dataSource: "api",
    };

    const strategyStr = body.selectedStrategies?.length
      ? body.selectedStrategies.join(", ")
      : body.strategy;
    const strategyRules = StrategyEngine.getStrategyRules(
      strategyStr as any,
      body.platform,
      body.tradeDuration,
      "api",
    ).rules;

    const analysisInput = {
      symbol: body.symbol,
      timeframe,
      tradeDuration: body.tradeDuration,
      strategy: strategyStr,
      strategyRules,
      marketData,
    };

    // Keep the API-mobile prompt independent from the Visual Only prompts.
    const apiPrompt = buildApiDataMobilePrompt(analysisInput);
    const result = await analyze({
      ...body,
      isProgressive: false,
      marketDataMode: "api",
      marketData,
      strategyRules,
      analysisPromptOverride: apiPrompt,
    } as any);

    const finalResponse = {
      ...result,
      marketDataMode: "api",
      marketProvider: "api",
      exchange: conn.exchange,
      marketDataStatus: "available",
      extractedApiData: {
        candleCount: ohlcv.length,
        recentCandles,
        currentPrice: ticker.last,
        indicators: latestIndicators,
        marketStructure: marketRegime,
        supportLevels: swings.swingLows,
        resistanceLevels: swings.swingHighs,
        source: "api",
      },
      unifiedMarketData: {
        symbol: body.symbol,
        timeframe,
        currentPrice: { value: ticker.last, source: "api", confidence: 100 },
        indicators: latestIndicators,
        marketStructure: { value: marketRegime, source: "api", confidence: 100 },
        trend: { value: marketRegime, source: "api", confidence: 100 },
        supportLevels: { value: swings.swingLows, source: "api", confidence: 100 },
        resistanceLevels: { value: swings.swingHighs, source: "api", confidence: 100 },
      },
      analysisType: "api-mobile",
      extractionOnly: false,
    };

    return NextResponse.json(finalResponse);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to analyze API data" },
      { status: 500 },
    );
  }
}
