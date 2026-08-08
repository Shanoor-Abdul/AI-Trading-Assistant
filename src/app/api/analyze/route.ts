import { NextRequest, NextResponse } from "next/server";

import { analyze } from "@/lib/ai";

import { AnalyzeRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeRequest;

    if (!body.imageBase64) {
      return NextResponse.json(
        {
          error: "Image is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!body.symbol || body.symbol === "Auto-Detecting...") {
      return NextResponse.json(
        { error: "Trading symbol is required for exact market data fetching." },
        { status: 400 }
      );
    }
    
    if (!body.timeframe || body.timeframe === "Auto-Detecting...") {
      return NextResponse.json(
        { error: "Timeframe is required for exact market data fetching." },
        { status: 400 }
      );
    }

    let marketData = null;
    let indicators = null;
    let marketRegime = null;
    let swings = null;

    try {
      const { CCXTProvider } = await import("@/lib/providers/market/CCXTProvider");
      const { IndicatorEngine } = await import("@/lib/engines/IndicatorEngine");
      const { MarketStructureEngine } = await import("@/lib/engines/MarketStructureEngine");
      
      const provider = new CCXTProvider('binance');
      const ohlcv = await provider.fetchOHLCV(body.symbol, body.timeframe, 200);
      const ticker = await provider.fetchTicker(body.symbol);
      
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

      // Phase 4: Multi-Timeframe Analysis
      if (body.timeframe !== '15m' && body.timeframe !== '1h' && body.timeframe !== '4h' && body.timeframe !== '1d') {
         try {
           const ohlcv15m = await provider.fetchOHLCV(body.symbol, '15m', 50);
           const ind15m = IndicatorEngine.calculate(ohlcv15m);
           marketData.multiTimeframe['15m_regime'] = MarketStructureEngine.determineRegime(ohlcv15m, ind15m?.latest);
         } catch(e) {}
      }
      if (body.timeframe !== '1h' && body.timeframe !== '4h' && body.timeframe !== '1d') {
         try {
           const ohlcv1h = await provider.fetchOHLCV(body.symbol, '1h', 50);
           const ind1h = IndicatorEngine.calculate(ohlcv1h);
           marketData.multiTimeframe['1h_regime'] = MarketStructureEngine.determineRegime(ohlcv1h, ind1h?.latest);
         } catch(e) {}
      }
      
    } catch (err: any) {
      console.warn("Failed to fetch exact market data from CCXT (Symbol might be OTC or invalid):", err.message);
      // Fallback to Visual-Only analysis if market data fails (e.g., for OTC pairs on OlympTrade)
    }

    let strategyRules = undefined;
    if (body.strategy) {
      const { StrategyEngine } = await import("@/lib/strategy/StrategyEngine");
      strategyRules = StrategyEngine.getStrategyRules(body.strategy as any).rules;
    }

    const result = await analyze({
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

    const { RiskEngine } = await import("@/lib/engines/RiskEngine");
    const validatedResult = RiskEngine.validateRiskReward(result);

    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: analysis } = await supabase.from('analyses').insert({
          user_id: user.id,
          prompt_version: "v2",
          strategy_version: body.strategy || "Standard",
          indicator_version: "v1",
          ai_model_version: body.model || "default",
          provider_version: body.provider || "default",
          symbol: body.symbol,
          timeframe: body.timeframe,
          market_data: marketData,
          indicators: indicators,
          market_regime: marketRegime,
          signal: validatedResult.signal,
          confidence: validatedResult.confidence,
          reason: validatedResult.explanation
        }).select().single();

        if (analysis && (validatedResult.signal === "BUY" || validatedResult.signal === "SELL")) {
          // Calculate theoretical position size (Assume 10k capital and 1% risk for now)
          const positionSize = RiskEngine.calculatePositionSize(10000, 1, validatedResult.entryPrice || 0, validatedResult.stopLoss || 0);
          const riskRewardRatio = Math.abs((validatedResult.takeProfit || 0) - (validatedResult.entryPrice || 0)) / (Math.abs((validatedResult.entryPrice || 0) - (validatedResult.stopLoss || 0)) || 1);

          await supabase.from('trades').insert({
            user_id: user.id,
            analysis_id: analysis.id,
            entry_price: validatedResult.entryPrice,
            stop_loss: validatedResult.stopLoss,
            take_profit: validatedResult.takeProfit,
            risk_reward_ratio: riskRewardRatio,
            position_size: positionSize,
            execution_mode: 'manual',
            status: 'OPEN'
          });
        }
      }
    } catch (dbErr: any) {
      console.error("Failed to journal trade to Supabase:", dbErr);
    }

    return NextResponse.json(validatedResult);
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error?.message ??
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}