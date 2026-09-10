import { DeterministicApiDecisionEngine, Candle, DeterministicDecisionResult } from "./DeterministicApiDecisionEngine";

export interface BacktestTradeLog {
  tradeId: number;
  entryIndex: number;
  entryTime: string;
  exitIndex: number;
  exitTime: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitPrice: number;
  outcome: "WIN" | "LOSS" | "EXPIRED";
  profitPips: number;
  riskPips: number;
  rewardPips: number;
  riskRewardRatio: number;
  confidence: number;
  setup: string;
  barsHeld: number;
}

export interface BacktestSummary {
  symbol: string;
  executionTimeframe: string;
  totalEvaluatedBars: number;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  wins: number;
  losses: number;
  expired: number;
  winRate: number; // percentage (0-100)
  lossRate: number; // percentage (0-100)
  averageRiskReward: number;
  totalProfitPips: number;
  maxDrawdownPips: number;
  profitFactor: number;
  filterEfficiency: number; // percentage (0-100)
  trades: BacktestTradeLog[];
}

export interface BacktestOptions {
  holdingBars?: number; // Maximum bars to hold before expiration (default: 12 bars = 60m on 5M)
  minConfidence?: number; // Minimum confidence to take trade (default: 65)
  pipMultiplier?: number;
  lookbackWindow?: number; // Minimum warm-up bars required before testing (default: 30)
}

export class DeterministicBacktestEngine {
  /**
   * Run historical deterministic backtest step-by-step
   * Strictly prevents lookahead bias by slicing data up to bar `i`.
   */
  static runBacktest(
    symbol: string,
    raw5m: any[],
    raw1h: any[] = [],
    raw4h: any[] = [],
    options: BacktestOptions = {}
  ): BacktestSummary {
    const candles5m = DeterministicApiDecisionEngine.parseCandles(raw5m);
    const candles1h = DeterministicApiDecisionEngine.parseCandles(raw1h);
    const candles4h = DeterministicApiDecisionEngine.parseCandles(raw4h);

    const holdingBars = options.holdingBars || 12;
    const minConfidence = options.minConfidence || 65;
    const lookbackWindow = Math.max(25, options.lookbackWindow || 30);
    const pipMultiplier =
      options.pipMultiplier ||
      (symbol.includes("JPY") || symbol.includes("XAU") || symbol.includes("XAG") ? 100 : 10000);

    const trades: BacktestTradeLog[] = [];
    let tradeCounter = 0;
    let totalEvaluated = 0;
    let avoidedLossCount = 0;
    let waitBarsCount = 0;

    let inTradeUntilIndex = -1;

    for (let i = lookbackWindow; i < candles5m.length - 1; i++) {
      totalEvaluated++;

      // Slice historical candles strictly up to current 5M candle timestamp
      const current5mCandle = candles5m[i];
      const currentTime = new Date(current5mCandle.datetime).getTime();

      const slice5m = candles5m.slice(0, i + 1);
      const slice1h = isNaN(currentTime)
        ? candles1h
        : candles1h.filter((c) => new Date(c.datetime).getTime() <= currentTime);
      const slice4h = isNaN(currentTime)
        ? candles4h
        : candles4h.filter((c) => new Date(c.datetime).getTime() <= currentTime);

      // Evaluate signal using deterministic engine
      const decision = DeterministicApiDecisionEngine.processTwelveDataMarketData(
        symbol,
        "5m",
        slice4h,
        slice1h,
        slice5m
      );

      // Filter efficiency tracking: check if WAIT was correct
      if (decision.signal === "WAIT" || decision.signal === "NO_TRADE") {
        waitBarsCount++;
        // Check if a naive trade in bias direction would have hit a loss
        const nextCandle = candles5m[i + 1];
        if (nextCandle) {
          const move = (nextCandle.close - current5mCandle.close) * pipMultiplier;
          if ((decision.directionalBias === "BULLISH" && move < 0) || (decision.directionalBias === "BEARISH" && move > 0)) {
            avoidedLossCount++;
          }
        }
      }

      // Check if we are currently holding an active trade
      if (i < inTradeUntilIndex) {
        continue;
      }

      if (
        (decision.signal === "BUY" || decision.signal === "SELL") &&
        decision.confidence >= minConfidence &&
        decision.tradeable
      ) {
        tradeCounter++;
        const direction = decision.signal;
        const entryPrice = decision.risk.active.entryPrice || current5mCandle.close;
        const stopLoss = decision.risk.active.stopLoss;
        const takeProfit = decision.risk.active.takeProfit;
        const riskPips = decision.risk.active.riskPips;
        const rewardPips = decision.risk.active.rewardPips;
        const riskRewardRatio = decision.risk.active.riskRewardRatio;

        let outcome: "WIN" | "LOSS" | "EXPIRED" = "EXPIRED";
        let exitIndex = Math.min(candles5m.length - 1, i + holdingBars);
        let exitPrice = candles5m[exitIndex].close;
        let profitPips = 0;
        let barsHeld = exitIndex - i;

        // Simulate forward progression bar-by-bar
        for (let j = i + 1; j <= exitIndex; j++) {
          const futureCandle = candles5m[j];

          if (direction === "BUY") {
            // Check SL first for conservative simulation
            if (futureCandle.low <= stopLoss) {
              outcome = "LOSS";
              exitIndex = j;
              exitPrice = stopLoss;
              profitPips = -riskPips;
              barsHeld = j - i;
              break;
            } else if (futureCandle.high >= takeProfit) {
              outcome = "WIN";
              exitIndex = j;
              exitPrice = takeProfit;
              profitPips = rewardPips;
              barsHeld = j - i;
              break;
            }
          } else {
            // SELL direction
            if (futureCandle.high >= stopLoss) {
              outcome = "LOSS";
              exitIndex = j;
              exitPrice = stopLoss;
              profitPips = -riskPips;
              barsHeld = j - i;
              break;
            } else if (futureCandle.low <= takeProfit) {
              outcome = "WIN";
              exitIndex = j;
              exitPrice = takeProfit;
              profitPips = rewardPips;
              barsHeld = j - i;
              break;
            }
          }
        }

        if (outcome === "EXPIRED") {
          const diff = direction === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
          profitPips = parseFloat((diff * pipMultiplier).toFixed(1));
        }

        trades.push({
          tradeId: tradeCounter,
          entryIndex: i,
          entryTime: current5mCandle.datetime,
          exitIndex,
          exitTime: candles5m[exitIndex].datetime,
          direction,
          entryPrice,
          stopLoss,
          takeProfit,
          exitPrice: parseFloat(exitPrice.toFixed(5)),
          outcome,
          profitPips,
          riskPips,
          rewardPips,
          riskRewardRatio,
          confidence: decision.confidence,
          setup: decision.setup,
          barsHeld,
        });

        inTradeUntilIndex = exitIndex;
      }
    }

    // Compute Summary Statistics
    const wins = trades.filter((t) => t.outcome === "WIN").length;
    const losses = trades.filter((t) => t.outcome === "LOSS").length;
    const expired = trades.filter((t) => t.outcome === "EXPIRED").length;
    const totalTrades = trades.length;

    const winRate = totalTrades > 0 ? parseFloat(((wins / totalTrades) * 100).toFixed(1)) : 0;
    const lossRate = totalTrades > 0 ? parseFloat(((losses / totalTrades) * 100).toFixed(1)) : 0;

    const buyTrades = trades.filter((t) => t.direction === "BUY").length;
    const sellTrades = trades.filter((t) => t.direction === "SELL").length;

    const totalProfitPips = parseFloat(trades.reduce((acc, t) => acc + t.profitPips, 0).toFixed(1));
    const avgRr =
      totalTrades > 0
        ? parseFloat((trades.reduce((acc, t) => acc + t.riskRewardRatio, 0) / totalTrades).toFixed(2))
        : 0;

    // Drawdown computation
    let peak = 0;
    let runningPips = 0;
    let maxDrawdownPips = 0;
    let totalWinPips = 0;
    let totalLossPips = 0;

    for (const t of trades) {
      runningPips += t.profitPips;
      if (runningPips > peak) peak = runningPips;
      const dd = peak - runningPips;
      if (dd > maxDrawdownPips) maxDrawdownPips = dd;

      if (t.profitPips > 0) totalWinPips += t.profitPips;
      else if (t.profitPips < 0) totalLossPips += Math.abs(t.profitPips);
    }

    const profitFactor = totalLossPips > 0 ? parseFloat((totalWinPips / totalLossPips).toFixed(2)) : totalWinPips > 0 ? 99 : 0;
    const filterEfficiency =
      waitBarsCount > 0 ? parseFloat(((avoidedLossCount / waitBarsCount) * 100).toFixed(1)) : 0;

    return {
      symbol,
      executionTimeframe: "5m",
      totalEvaluatedBars: totalEvaluated,
      totalTrades,
      buyTrades,
      sellTrades,
      wins,
      losses,
      expired,
      winRate,
      lossRate,
      averageRiskReward: avgRr,
      totalProfitPips,
      maxDrawdownPips: parseFloat(maxDrawdownPips.toFixed(1)),
      profitFactor,
      filterEfficiency,
      trades,
    };
  }
}
