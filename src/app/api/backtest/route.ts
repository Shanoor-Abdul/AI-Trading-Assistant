import { NextRequest, NextResponse } from "next/server";
import { CCXTProvider } from "@/lib/providers/market/CCXTProvider";
import { IndicatorEngine } from "@/lib/engines/IndicatorEngine";
import { MarketStructureEngine } from "@/lib/engines/MarketStructureEngine";
import { analyze } from "@/lib/ai";
import { RiskEngine, RiskConfig, AccountState } from "@/lib/engines/RiskEngine";
import { StrategyEngine } from "@/lib/strategy/StrategyEngine";

export const maxDuration = 60; // Next.js max duration for this route

export async function POST(req: NextRequest) {
  try {
    const { symbol, timeframe, strategy, provider, model, days } = await req.json();

    if (!symbol || !timeframe) {
      return NextResponse.json({ error: "Symbol and Timeframe required." }, { status: 400 });
    }

    const ccxt = new CCXTProvider('binance');
    
    // Fetch historical data (e.g. 500 candles)
    // 500 candles on 1h = ~20 days.
    const ohlcv = await ccxt.fetchOHLCV(symbol, timeframe, 500);
    
    if (ohlcv.length < 100) {
      return NextResponse.json({ error: "Not enough historical data available." }, { status: 400 });
    }

    // We simulate by walking forward in time. 
    // To avoid hitting LLM rate limits in this demo, we will only sample the last 5 significant swing points 
    // instead of running 400 LLM calls sequentially which would timeout the server.
    
    const swings = MarketStructureEngine.findSwings(ohlcv);
    // Take the last 5 swings to simulate trade entries
    const allSwings = [...swings.swingHighs, ...swings.swingLows].sort((a, b) => a.index - b.index);
    const testPoints = allSwings.slice(-5);
    
    const strategyRules = StrategyEngine.getStrategyRules(strategy as any).rules;
    const results = [];
    
    let simulatedCapital = 10000;
    
    const riskConfig: RiskConfig = {
      minimumRiskReward: 2.0, maxDailyLoss: 5, maxOpenPositions: 3, maxConsecutiveLosses: 3, staleDataThresholdSeconds: 99999999 // Ignore staleness in backtest
    };
    
    for (const point of testPoints) {
      const targetIndex = point.index;
      const slicedOhlcv = ohlcv.slice(0, targetIndex + 1);
      const indData = IndicatorEngine.calculate(slicedOhlcv);
      
      const marketData = {
        lastPrice: (slicedOhlcv[slicedOhlcv.length - 1] as unknown as number[])[4], // close
        recentCandles: slicedOhlcv.slice(-5),
        indicators: indData?.latest,
        marketRegime: MarketStructureEngine.determineRegime(slicedOhlcv, indData?.latest),
        swings: MarketStructureEngine.findSwings(slicedOhlcv)
      };

      try {
        let aiResult = await analyze({
          symbol,
          timeframe,
          provider: provider || "gemini",
          model: model || "gemini-2.5-flash",
          marketData,
          strategyRules
        } as any);

        const accountState: AccountState = { currentDailyLoss: 0, openPositionsCount: 0, consecutiveLosses: 0, inCooldown: false };
        aiResult = RiskEngine.validate(aiResult, riskConfig, accountState);

        if (aiResult.signal === "BUY" || aiResult.signal === "SELL") {
          // Simulate trade outcome looking forward
          const futureCandles = ohlcv.slice(targetIndex + 1, targetIndex + 50); // look ahead 50 candles
          let outcome = "OPEN";
          let pnl = 0;
          let mfe = 0;
          let mae = 0;
          
          for (const fc of futureCandles) {
            const high = (fc as unknown as number[])[2];
            const low = (fc as unknown as number[])[3];
            
            if (aiResult.signal === "BUY") {
              mfe = Math.max(mfe, high - (aiResult.entryPrice || 0));
              mae = Math.max(mae, (aiResult.entryPrice || 0) - low);
              
              if (low <= (aiResult.stopLoss || 0)) {
                outcome = "LOST";
                pnl = -((aiResult.entryPrice || 0) - (aiResult.stopLoss || 0));
                break;
              }
              if (high >= (aiResult.takeProfit || 0)) {
                outcome = "WON";
                pnl = (aiResult.takeProfit || 0) - (aiResult.entryPrice || 0);
                break;
              }
            } else {
              mfe = Math.max(mfe, (aiResult.entryPrice || 0) - low);
              mae = Math.max(mae, high - (aiResult.entryPrice || 0));
              
              if (high >= (aiResult.stopLoss || 0)) {
                outcome = "LOST";
                pnl = -((aiResult.stopLoss || 0) - (aiResult.entryPrice || 0));
                break;
              }
              if (low <= (aiResult.takeProfit || 0)) {
                outcome = "WON";
                pnl = (aiResult.entryPrice || 0) - (aiResult.takeProfit || 0);
                break;
              }
            }
          }

          // Apply position sizing
          const positionSize = RiskEngine.calculatePositionSize(simulatedCapital, 1, aiResult.entryPrice || 0, aiResult.stopLoss || 0);
          const actualPnl = pnl * positionSize;
          simulatedCapital += actualPnl;

          results.push({
            timestamp: point.time,
            signal: aiResult.signal,
            entry: aiResult.entryPrice,
            tp: aiResult.takeProfit,
            sl: aiResult.stopLoss,
            outcome,
            mfe, mae,
            pnl: actualPnl
          });
        }
      } catch(e) {
        console.error("Backtest step failed:", e);
      }
    }

    const won = results.filter(r => r.outcome === 'WON').length;
    const lost = results.filter(r => r.outcome === 'LOST').length;
    const winRate = results.length > 0 ? (won / (won+lost) * 100).toFixed(2) : 0;
    
    return NextResponse.json({
      success: true,
      tradesEvaluated: results.length,
      winRate,
      finalCapital: simulatedCapital,
      trades: results
    });

  } catch (error: any) {
    console.error("Backtest error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
