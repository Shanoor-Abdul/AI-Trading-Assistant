import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/ai";
import { AnalyzeRequest, TradingAnalysis } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
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

    let marketData = null;
    let indicators = null;
    let marketRegime = null;
    let swings = null;
    
    let exchange = "unknown";
    let marketProvider = "none";
    let dataTimestamp = Date.now();
    let dataAge = 0;
    
    let primaryTimeframe = body.timeframe;
    let confirmationTimeframe = "15m";
    let trendTimeframe = "1h";

    try {
      const { CCXTProvider } = await import("@/lib/providers/market/CCXTProvider");
      const { IndicatorEngine } = await import("@/lib/engines/IndicatorEngine");
      const { MarketStructureEngine } = await import("@/lib/engines/MarketStructureEngine");
      
      const provider = new CCXTProvider('binance');
      exchange = "binance";
      marketProvider = "ccxt";
      
      const ohlcv = await provider.fetchOHLCV(body.symbol, body.timeframe, 200);
      const ticker = await provider.fetchTicker(body.symbol);
      
      if (ohlcv.length > 0) {
        dataTimestamp = (ohlcv[ohlcv.length - 1] as unknown as number[])[0]; // timestamp of latest candle
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

      // MTF Snapshots
      if (body.timeframe === '5m') {
         confirmationTimeframe = "15m";
         trendTimeframe = "1h";
      } else if (body.timeframe === '15m') {
         confirmationTimeframe = "1h";
         trendTimeframe = "4h";
      }

      if (confirmationTimeframe && confirmationTimeframe !== body.timeframe) {
         try {
           const ohlcvConf = await provider.fetchOHLCV(body.symbol, confirmationTimeframe, 50);
           const indConf = IndicatorEngine.calculate(ohlcvConf);
           marketData.multiTimeframe[`${confirmationTimeframe}_regime`] = MarketStructureEngine.determineRegime(ohlcvConf, indConf?.latest);
         } catch(e) {}
      }
      
      if (trendTimeframe && trendTimeframe !== body.timeframe && trendTimeframe !== confirmationTimeframe) {
         try {
           const ohlcvTrend = await provider.fetchOHLCV(body.symbol, trendTimeframe, 50);
           const indTrend = IndicatorEngine.calculate(ohlcvTrend);
           marketData.multiTimeframe[`${trendTimeframe}_regime`] = MarketStructureEngine.determineRegime(ohlcvTrend, indTrend?.latest);
         } catch(e) {}
      }
      
    } catch (err: any) {
      console.warn("Failed to fetch exact market data from CCXT (Symbol might be OTC or invalid):", err.message);
      marketProvider = "visual_only";
    }

    let strategyRules = undefined;
    if (body.strategy) {
      const { StrategyEngine } = await import("@/lib/strategy/StrategyEngine");
      strategyRules = StrategyEngine.getStrategyRules(body.strategy as any).rules;
    }

    let result = await analyze({
      imageBase64: body.imageBase64,
      symbol: body.symbol,
      timeframe: body.timeframe,
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
    
    // Auth & Database Integration
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Fetch Profile Risk Config
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        
        const riskConfig = {
          minimumRiskReward: profile?.minimum_risk_reward || 2.0,
          maxDailyLoss: profile?.max_daily_loss || 5.0,
          maxOpenPositions: profile?.max_open_positions || 3,
          maxConsecutiveLosses: 3, 
          staleDataThresholdSeconds: 300 // 5 mins
        };

        const accountState = {
          currentDailyLoss: 0, // Mock for now, would query today's trades PnL
          openPositionsCount: 0, // Would query count of OPEN trades
          consecutiveLosses: 0, 
          inCooldown: false
        };

        // Strict validation overriding result if needed
        result = RiskEngine.validate(result, riskConfig, accountState);

        // Upload Screenshot to Storage (Base64 to Buffer)
        let screenshotUrl = null;
        if (body.imageBase64) {
          const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          
          const filename = `analyses/${user.id}/${Date.now()}.png`;
          const { data: storageData, error: storageError } = await supabase.storage
            .from('screenshots')
            .upload(filename, buffer, { contentType: 'image/png' });
            
          if (!storageError && storageData) {
             const { data: publicUrlData } = supabase.storage.from('screenshots').getPublicUrl(storageData.path);
             screenshotUrl = publicUrlData.publicUrl;
          } else {
             console.error("Storage upload failed:", storageError);
          }
        }

        // Insert Analysis
        const { data: analysis } = await supabase.from('analyses').insert({
          user_id: user.id,
          prompt_version: "v3",
          strategy_version: body.strategy || "Standard",
          indicator_version: "v2",
          ai_model_version: body.model || "default",
          provider_version: body.provider || "default",
          symbol: body.symbol,
          timeframe: body.timeframe,
          screenshot_url: screenshotUrl, // Use URL, NOT base64
          market_data: marketData,
          indicators: indicators,
          market_regime: marketRegime,
          signal: result.signal,
          confidence: result.confidence,
          reason: result.explanation,
          exchange: exchange,
          market_provider: marketProvider,
          data_timestamp: new Date(dataTimestamp).toISOString(),
          data_age: dataAge,
          primary_timeframe: primaryTimeframe,
          confirmation_timeframe: confirmationTimeframe,
          trend_timeframe: trendTimeframe,
          risk_decision: result.riskDecision
        }).select().single();

        const tradingMode = profile?.trading_mode || 'MANUAL';
        let tradeStatus = 'OPEN';
        
        if (analysis && (result.signal === "BUY" || result.signal === "SELL")) {
          const positionSize = RiskEngine.calculatePositionSize(profile?.capital || 10000, profile?.risk_percent || 1, result.entryPrice || 0, result.stopLoss || 0);

          // Phase 9: LIVE Execution
          if (tradingMode === 'LIVE') {
            try {
              const { data: keys } = await supabase.from('exchange_keys').select('*').eq('user_id', user.id).eq('exchange', 'binance').single();
              if (keys && keys.api_key && keys.api_secret) {
                 const { LiveExecutionProvider } = await import("@/lib/providers/execution/LiveExecutionProvider");
                 const liveProvider = new LiveExecutionProvider('binance', keys.api_key, keys.api_secret, keys.api_passphrase);
                 await liveProvider.connect();
                 const liveResult = await liveProvider.executeTrade(body.symbol, result as any, positionSize);
                 tradeStatus = liveResult.status;
              } else {
                 console.warn("No exchange keys found. Falling back to OPEN status.");
              }
            } catch (err: any) {
              console.error("Live Execution Failed:", err);
              tradeStatus = 'RISK_REJECTED'; // Or a new status like EXECUTION_FAILED
            }
          }

          const { data: tradeData } = await supabase.from('trades').insert({
            user_id: user.id,
            analysis_id: analysis.id,
            entry_price: result.entryPrice,
            stop_loss: result.stopLoss,
            take_profit: result.takeProfit,
            risk_reward_ratio: result.riskReward,
            position_size: positionSize,
            execution_mode: tradingMode,
            status: tradeStatus
          }).select().single();
          
          if (tradeData) {
            (result as any).dbTradeId = tradeData.id;
          }
        }
      } else {
        // Fallback default config if not logged in
        result = RiskEngine.validate(result, {
          minimumRiskReward: 2.0, maxDailyLoss: 5, maxOpenPositions: 3, maxConsecutiveLosses: 3, staleDataThresholdSeconds: 300
        }, { currentDailyLoss: 0, openPositionsCount: 0, consecutiveLosses: 0, inCooldown: false });
      }
    } catch (dbErr: any) {
      console.error("Failed to journal trade to Supabase:", dbErr);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error?.message ?? "Internal Server Error" }, { status: 500 });
  }
}