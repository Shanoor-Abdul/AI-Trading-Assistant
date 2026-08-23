import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CCXTProvider } from "@/lib/providers/market/CCXTProvider";
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

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let exchangeName = "alpaca";
    let apiKey = undefined;
    let apiSecret = undefined;
    let environment = undefined;
    let passphrase = undefined;

    if (body.activeConnectionId && user?.id) {
      const { data: conn } = await supabase
        .from("exchange_keys")
        .select("*")
        .eq("id", body.activeConnectionId)
        .eq("user_id", user.id)
        .single();
      
      if (conn) {
        exchangeName = conn.exchange;
        apiKey = conn.api_key;
        apiSecret = conn.api_secret;
        environment = conn.environment;
        passphrase = conn.passphrase;
      }
    }

    // 1. Fetch CCXT Data
    const provider = new CCXTProvider(exchangeName, apiKey, apiSecret, passphrase, environment);
    
    // Fallback timeframes if not explicitly handled
    const primaryTimeframe = body.timeframe || "5m";
    const confirmationTimeframe = "15m";
    const trendTimeframe = "1h";

    const [ohlcvResult, tickerResult] = await Promise.allSettled([
      provider.fetchOHLCV(body.symbol, primaryTimeframe, 100),
      provider.fetchTicker(body.symbol)
    ]);

    if (ohlcvResult.status === "rejected" || tickerResult.status === "rejected") {
      throw new Error("Failed to fetch market data from the exchange.");
    }

    const ohlcv = ohlcvResult.value;
    const ticker = tickerResult.value;

    if (!ohlcv || ohlcv.length < 50) {
      return NextResponse.json({ 
        error: `Insufficient historical data for ${body.symbol} on ${exchangeName}. Received ${ohlcv?.length || 0} candles, but at least 50 are required to calculate indicators like RSI and MACD. Try a different symbol like BTC/USD or a longer timeframe.` 
      }, { status: 400 });
    }

    // 2. Deterministic Indicators
    const indData = IndicatorEngine.calculate(ohlcv);
    const marketRegime = MarketStructureEngine.determineRegime(ohlcv, indData?.latest);
    const swings = MarketStructureEngine.findSwings(ohlcv);

    const marketData = {
      lastPrice: ticker.last,
      recentCandles: ohlcv.slice(-5),
      indicators: indData?.latest,
      marketRegime,
      swings
    };

    // 3. Strategy Rules
    const strategyStr = body.selectedStrategies ? body.selectedStrategies.join(", ") : body.strategy;
    const strategyRules = StrategyEngine.getStrategyRules(
      strategyStr as any,
      body.platform,
      body.tradeDuration,
      "api"
    ).rules;

    // 4. Send to AI
    const analyzeReq = {
      ...body,
      isProgressive: false,
      marketDataMode: "api",
      marketData,
      strategyRules
    };

    const result = await analyze(analyzeReq as any);

    // 5. Build Final Response
    const finalResponse = {
      ...result,
      tradeDuration: body.tradeDuration,
      marketDataMode: "api",
      marketProvider: "api",
      exchange: exchangeName,
      marketDataStatus: "available",
      unifiedMarketData: {
        symbol: body.symbol,
        timeframe: primaryTimeframe,
        currentPrice: { 
          value: ticker.last, 
          source: "api", 
          confidence: 100 
        },
        indicators: {
          ...(result.unifiedMarketData?.indicators || {}),
          RAW_VALUES: indData?.latest
        },
        marketStructure: { value: marketRegime.regime, source: "api", confidence: 100 },
        trend: { value: marketRegime.trend, source: "api", confidence: 100 },
        supportLevels: { value: swings.lows, source: "api", confidence: 100 },
        resistanceLevels: { value: swings.highs, source: "api", confidence: 100 }
      },
      analysisType: "api",
      extractionOnly: false
    };

    // Save to DB
    if (user?.id) {
      const { error: dbError } = await supabase.from("trade_analyses").insert({
        user_id: user.id,
        provider_version: body.provider || "default",
        symbol: body.symbol,
        timeframe: primaryTimeframe,
        market_data: marketData,
        indicators: indData?.latest,
        market_regime: marketRegime,
        signal: result.signal,
        confidence: result.confidence,
        reason: result.explanation,
        exchange: exchangeName,
        market_provider: "ccxt",
        market_data_mode: "api",
        market_data_status: "available",
        data_timestamp: new Date().toISOString()
      });
      if (dbError) {
        // Silently ignore DB errors as per user request to remove console logs
      }
    }

    return NextResponse.json(finalResponse);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to analyze API data" }, { status: 500 });
  }
}
