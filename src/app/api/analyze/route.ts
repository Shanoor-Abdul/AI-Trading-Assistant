import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/ai";
import { AnalyzeRequest, TradingAnalysis } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const t0 = performance.now();
    let timings = {
      validationMs: 0,
      marketDataMs: 0,
      indicatorMs: 0,
      aiMs: 0,
      storageMs: 0,
      databaseMs: 0,
      totalMs: 0
    };

    const body = (await req.json()) as AnalyzeRequest;

    if (!body.imageBase64) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }

    if (!body.symbol || body.symbol === "Auto-Detecting...") {
      return NextResponse.json({ error: "Trading symbol is required for exact market data fetching." }, { status: 400 });
    }
    
    if (!body.timeframe || body.timeframe === "Auto-Detecting...") {
      return NextResponse.json({ error: "Timeframe is required for exact market data fetching." }, { status: 400 });
    }
    
    timings.validationMs = performance.now() - t0;

    let marketData = null;
    let indicators = null;
    let marketRegime = null;
    let swings = null;
    
    let exchange = "unknown";
    let marketProvider = "binance";
    let marketDataStatus = "not_requested";
    const mode = body.marketDataMode || "api";
    let dataTimestamp = Date.now();
    let dataAge = 0;
    
    let primaryTimeframe = body.timeframe || "5m";
    let confirmationTimeframe = body.confirmationTimeframe;
    let trendTimeframe = body.trendTimeframe;

    const tMarketStart = performance.now();

    try {
      if (mode === "visual_only") {
        marketProvider = "visual_only";
        marketDataStatus = "not_requested";
      } else {
        const { CCXTProvider } = await import("@/lib/providers/market/CCXTProvider");
        const { IndicatorEngine } = await import("@/lib/engines/IndicatorEngine");
        const { MarketStructureEngine } = await import("@/lib/engines/MarketStructureEngine");
        
        const provider = new CCXTProvider('binance');
        exchange = "binance";
        marketProvider = "ccxt";
        marketDataStatus = "available";
        
        // Strategy-based MTF resolution
        if (!confirmationTimeframe) {
          const strategy = body.strategy || "Trend Following";
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
            confirmationTimeframe = primaryTimeframe === "1m" ? "5m" : (primaryTimeframe === "5m" ? "15m" : "1h");
            trendTimeframe = primaryTimeframe === "1m" ? "15m" : (primaryTimeframe === "5m" ? "1h" : "4h");
          }
        }

        // Fetch all market data concurrently to drastically reduce latency
        const [ohlcvResult, tickerResult, ohlcvConfResult, ohlcvTrendResult] = await Promise.allSettled([
          provider.fetchOHLCV(body.symbol, body.timeframe, 200),
          provider.fetchTicker(body.symbol),
          confirmationTimeframe && confirmationTimeframe !== body.timeframe ? provider.fetchOHLCV(body.symbol, confirmationTimeframe, 50) : Promise.resolve(null),
          trendTimeframe && trendTimeframe !== body.timeframe && trendTimeframe !== confirmationTimeframe ? provider.fetchOHLCV(body.symbol, trendTimeframe, 50) : Promise.resolve(null)
        ]);

        if (ohlcvResult.status === 'rejected') {
          throw new Error(ohlcvResult.reason?.message || "Failed to fetch primary OHLCV");
        }

        const ohlcv = ohlcvResult.value;
        const ticker = tickerResult.status === 'fulfilled' ? tickerResult.value : { last: 0 };
        
        if (ohlcv.length > 0) {
          dataTimestamp = (ohlcv[ohlcv.length - 1] as any).openTime || Date.now();
          dataAge = Math.floor((Date.now() - dataTimestamp) / 1000);
        }
        
        const indData = IndicatorEngine.calculate(ohlcv);
        
        marketData = {
          lastPrice: ticker.last,
          recentCandles: ohlcv.slice(-5),
          multiTimeframe: {} as any
        };
        
        if (indData) {
          indicators = indData.latest;
          marketRegime = MarketStructureEngine.determineRegime(ohlcv, indicators);
          swings = MarketStructureEngine.findSwings(ohlcv);
        }

        // Process Confirmation Timeframe
        if (ohlcvConfResult.status === 'fulfilled' && ohlcvConfResult.value) {
          const indConf = IndicatorEngine.calculate(ohlcvConfResult.value);
          marketData.multiTimeframe[`${confirmationTimeframe}_regime`] = MarketStructureEngine.determineRegime(ohlcvConfResult.value, indConf?.latest);
        }
        
        // Process Trend Timeframe
        if (ohlcvTrendResult.status === 'fulfilled' && ohlcvTrendResult.value) {
          const indTrend = IndicatorEngine.calculate(ohlcvTrendResult.value);
          marketData.multiTimeframe[`${trendTimeframe}_regime`] = MarketStructureEngine.determineRegime(ohlcvTrendResult.value, indTrend?.latest);
        }
      }
      timings.marketDataMs = performance.now() - tMarketStart;
    } catch (err: any) {
      timings.marketDataMs = performance.now() - tMarketStart;
      console.warn("Failed to fetch exact market data from CCXT (Symbol might be OTC or invalid):", err.message);
      marketProvider = "visual_only";
      marketDataStatus = "unavailable";
    }

    const tIndicatorStart = performance.now();
    let strategyRules = undefined;
    if (body.strategy) {
      const { StrategyEngine } = await import("@/lib/strategy/StrategyEngine");
      strategyRules = StrategyEngine.getStrategyRules(body.strategy as any).rules;
    }
    timings.indicatorMs = performance.now() - tIndicatorStart;

    const tAiStart = performance.now();
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Start AI Analysis Promise
    const aiPromise = analyze({
      imageBase64: body.imageBase64,
      symbol: body.symbol,
      timeframe: body.timeframe,
      platform: body.platform,
      tradeDuration: body.tradeDuration,
      provider: body.provider || "gemini",
      model: body.model,
      marketData: {
        ...marketData,
        indicators,
        marketRegime,
        swings
      },
      strategyRules
    } as any);

    // 2. Start Storage Upload Promise in parallel
    const tStorageStart = performance.now();
    let screenshotUrlPromise: Promise<string | null> = Promise.resolve(null);
    
    if (user && body.imageBase64) {
      const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `analyses/${user.id}/${Date.now()}.png`;
      
      screenshotUrlPromise = supabase.storage
        .from('screenshots')
        .upload(filename, buffer, { contentType: 'image/png' })
        .then(res => {
          if (res.data) {
            return supabase.storage.from('screenshots').getPublicUrl(res.data.path).data.publicUrl;
          }
          return null;
        }).catch(err => {
          console.error("Storage upload failed:", err);
          return null;
        });
    }

    // Wait for both AI and Storage to finish
    let [result, screenshotUrl] = await Promise.all([aiPromise, screenshotUrlPromise]);
    timings.aiMs = performance.now() - tAiStart;
    timings.storageMs = performance.now() - tStorageStart; // Note: Started in parallel

    // Attach integrity metadata to result
    result.exchange = exchange;
    result.marketProvider = marketProvider;
    result.dataTimestamp = dataTimestamp;
    result.dataAge = dataAge;
    result.primaryTimeframe = primaryTimeframe;
    result.confirmationTimeframe = confirmationTimeframe;
    result.trendTimeframe = trendTimeframe;

    // Apply Risk Validation
    const { RiskEngine } = await import("@/lib/engines/RiskEngine");
    
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      
      const riskConfig = {
        minimumRiskReward: profile?.minimum_risk_reward || 2.0,
        maxDailyLoss: profile?.max_daily_loss || 5.0,
        maxOpenPositions: profile?.max_open_positions || 3,
        maxConsecutiveLosses: 3, 
        staleDataThresholdSeconds: 300
      };

      const accountState = { currentDailyLoss: 0, openPositionsCount: 0, consecutiveLosses: 0, inCooldown: false };

      // Strict validation overriding result if needed
      result = RiskEngine.validate(result, riskConfig, accountState);

      // NON-BLOCKING PERSISTENCE: Fire and forget DB inserts to save response latency
      const tDbStart = performance.now();
      const tradingMode = profile?.trading_mode || 'MANUAL';
      
      const persistToDB = async () => {
        try {
          const { data: analysis } = await supabase.from('analyses').insert({
            user_id: user.id,
            prompt_version: "v3",
            strategy_version: body.strategy || "Standard",
            indicator_version: "v2",
            ai_model_version: body.model || "default",
            provider_version: body.provider || "default",
            symbol: body.symbol,
            timeframe: body.timeframe,
            screenshot_url: screenshotUrl,
            market_data: marketData,
            indicators: indicators,
            market_regime: marketRegime,
            signal: result.signal,
            confidence: result.confidence,
            reason: result.explanation,
            exchange: exchange,
            market_provider: marketProvider,
            market_data_mode: mode,
            market_data_status: marketDataStatus,
            data_timestamp: dataTimestamp > 0 ? new Date(dataTimestamp).toISOString() : null,
            data_age: dataAge,
            primary_timeframe: primaryTimeframe,
            confirmation_timeframe: confirmationTimeframe,
            trend_timeframe: trendTimeframe,
            risk_decision: result.riskDecision
          }).select().single();

          if (analysis && (result.signal === "BUY" || result.signal === "SELL")) {
            const positionSize = RiskEngine.calculatePositionSize(profile?.capital || 10000, profile?.risk_percent || 1, result.entryPrice || 0, result.stopLoss || 0);
            let tradeStatus = 'OPEN';
            
            if (tradingMode === 'LIVE') {
              try {
                const { data: keys } = await supabase.from('exchange_keys').select('*').eq('user_id', user.id).eq('exchange', 'binance').single();
                if (keys && keys.api_key && keys.api_secret) {
                   const { LiveExecutionProvider } = await import("@/lib/providers/execution/LiveExecutionProvider");
                   const liveProvider = new LiveExecutionProvider('binance', keys.api_key, keys.api_secret, keys.api_passphrase);
                   await liveProvider.connect();
                   const liveResult = await liveProvider.executeTrade(body.symbol!, result as any, positionSize);
                   tradeStatus = liveResult.status;
                }
              } catch (err: any) {
                console.error("Live Execution Failed:", err);
                tradeStatus = 'RISK_REJECTED';
              }
            }

            await supabase.from('trades').insert({
              user_id: user.id,
              analysis_id: analysis.id,
              entry_price: result.entryPrice,
              stop_loss: result.stopLoss,
              take_profit: result.takeProfit,
              risk_reward_ratio: result.riskReward,
              position_size: positionSize,
              execution_mode: tradingMode,
              status: tradeStatus
            });
          }
        } catch (dbErr: any) {
          console.error("Failed to journal trade to Supabase:", dbErr);
        }
      };

      // Fire and forget
      persistToDB();
      timings.databaseMs = performance.now() - tDbStart;

    } else {
      result = RiskEngine.validate(result, {
        minimumRiskReward: 2.0, maxDailyLoss: 5, maxOpenPositions: 3, maxConsecutiveLosses: 3, staleDataThresholdSeconds: 300
      }, { currentDailyLoss: 0, openPositionsCount: 0, consecutiveLosses: 0, inCooldown: false });
    }

    timings.totalMs = performance.now() - t0;
    (result as any).timings = timings; // Inject timings for debug
    result.marketDataMode = mode as any;
    result.marketDataStatus = marketDataStatus as any;
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error?.message ?? "Internal Server Error" }, { status: 500 });
  }
}