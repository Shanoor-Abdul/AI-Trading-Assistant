import { TradingAnalysis } from "@/lib/types";

export class RiskEngine {
  /**
   * Validates the Risk to Reward ratio of a trade signal.
   * If the R:R is less than 1:1.5, it downgrades the signal to WAIT.
   */
  static validateRiskReward(analysis: TradingAnalysis): TradingAnalysis {
    if (analysis.signal !== "BUY" && analysis.signal !== "SELL") {
      return analysis;
    }

    if (!analysis.entryPrice || !analysis.stopLoss || !analysis.takeProfit) {
      return analysis;
    }

    const risk = Math.abs(analysis.entryPrice - analysis.stopLoss);
    const reward = Math.abs(analysis.takeProfit - analysis.entryPrice);

    if (risk === 0) return analysis;

    const rrRatio = reward / risk;

    // Minimum acceptable R:R is 1.5
    if (rrRatio < 1.5) {
      analysis.signal = "WAIT";
      analysis.explanation = `[RISK ENGINE OVERRIDE] AI suggested a trade with an R:R of 1:${rrRatio.toFixed(2)}, which is below our 1:1.5 threshold. Wait for a better setup.\n\nOriginal AI Logic: ${analysis.explanation}`;
    }

    return analysis;
  }

  /**
   * Calculates the position size based on account balance and risk percentage.
   */
  static calculatePositionSize(accountBalance: number, riskPercentage: number, entry: number, stopLoss: number): number {
    const riskAmount = accountBalance * (riskPercentage / 100);
    const riskPerShare = Math.abs(entry - stopLoss);
    
    if (riskPerShare === 0) return 0;
    
    return riskAmount / riskPerShare;
  }
}
