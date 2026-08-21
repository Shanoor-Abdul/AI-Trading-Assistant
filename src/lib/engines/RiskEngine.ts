import { TradingAnalysis } from "@/lib/types";
import type { UniversalAIResponse } from "@/lib/ai/schema";

type RiskCompatibleAnalysis = TradingAnalysis | UniversalAIResponse;

export interface RiskConfig {
  minimumRiskReward: number;
  maxDailyLoss: number;
  maxOpenPositions: number;
  maxConsecutiveLosses: number;
  staleDataThresholdSeconds: number; // e.g., 300 for 5 minutes
}

export interface AccountState {
  currentDailyLoss: number; // e.g. 2.5 (%)
  openPositionsCount: number;
  consecutiveLosses: number;
  inCooldown: boolean;
}

export class RiskEngine {
  /**
   * Authoritatively validates a trade signal against risk parameters and account state.
   *
   * Supports both the normalized TradingAnalysis contract and the stricter
   * UniversalAIResponse contract used by the AI layer. The validator only
   * mutates fields that are shared by both contracts and preserves the
   * concrete input type for callers.
   */
  static validate<T extends RiskCompatibleAnalysis>(
    analysis: T,
    config: RiskConfig,
    account: AccountState,
    platform?: string
  ): T {
    const dataAge = (analysis as RiskCompatibleAnalysis & { dataAge?: number }).dataAge;
    const marketDataMode = (analysis as RiskCompatibleAnalysis & { marketDataMode?: string }).marketDataMode;
    const tradeDuration = (analysis as RiskCompatibleAnalysis & { tradeDuration?: string }).tradeDuration;

    // 1. Data Freshness Check
    if (dataAge !== undefined && dataAge > config.staleDataThresholdSeconds) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "STALE_DATA";
      analysis.explanation = `[RISK ENGINE REJECTED] Market data is ${dataAge}s old (Threshold: ${config.staleDataThresholdSeconds}s). Stale data.`;
      return analysis;
    }

    if (analysis.signal !== "BUY" && analysis.signal !== "SELL") {
      analysis.riskDecision = analysis.signal;
      return analysis;
    }

    // 2. Account State Limits
    if (account.inCooldown) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "COOLDOWN_ACTIVE";
      analysis.explanation = `[RISK ENGINE REJECTED] Account is in cooldown.`;
      return analysis;
    }

    if (account.openPositionsCount >= config.maxOpenPositions) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "MAX_OPEN_POSITIONS";
      analysis.explanation = `[RISK ENGINE REJECTED] Maximum open positions reached (${config.maxOpenPositions}).`;
      return analysis;
    }

    if (account.currentDailyLoss >= config.maxDailyLoss) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "MAX_DAILY_LOSS";
      analysis.explanation = `[RISK ENGINE REJECTED] Maximum daily loss limit reached (${config.maxDailyLoss}%).`;
      return analysis;
    }

    if (account.consecutiveLosses >= config.maxConsecutiveLosses) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "MAX_CONSECUTIVE_LOSSES";
      analysis.explanation = `[RISK ENGINE REJECTED] Maximum consecutive losses reached.`;
      return analysis;
    }

    // 3. Trade Setup Validation (Prices & RR)
    if (platform === "olymptrade" || (marketDataMode === "visual_only" && !!tradeDuration)) {
      // Fixed-time binary options or visual-only directional trades: SL/TP/RR don't apply.
      analysis.riskDecision = "APPROVED";
      return analysis;
    }

    if (!analysis.entryPrice || !analysis.stopLoss || !analysis.takeProfit) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "MISSING_PRICES";
      analysis.explanation = `[RISK ENGINE REJECTED] Missing Entry, Stop Loss, or Take Profit values.`;
      return analysis;
    }

    const risk = Math.abs(analysis.entryPrice - analysis.stopLoss);
    const reward = Math.abs(analysis.takeProfit - analysis.entryPrice);

    if (risk === 0) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "INVALID_RISK";
      analysis.explanation = `[RISK ENGINE REJECTED] Risk amount is zero (Entry equals Stop Loss).`;
      return analysis;
    }

    const rrRatio = reward / risk;
    analysis.riskReward = Number(rrRatio.toFixed(2));

    if (rrRatio < config.minimumRiskReward) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "LOW_RR";
      analysis.explanation = `[RISK ENGINE REJECTED] AI suggested a trade with an R:R of 1:${rrRatio.toFixed(2)}, which is below our 1:${config.minimumRiskReward} threshold.`;
      return analysis;
    }

    // 4. Directional validation (BUY should have TP > Entry > SL)
    if (analysis.signal === "BUY" && (analysis.takeProfit <= analysis.entryPrice || analysis.stopLoss >= analysis.entryPrice)) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "INVALID_BUY_PRICES";
      analysis.explanation = `[RISK ENGINE REJECTED] Invalid BUY setup. TP must be > Entry, and SL must be < Entry.`;
      return analysis;
    }

    // SELL should have TP < Entry < SL
    if (analysis.signal === "SELL" && (analysis.takeProfit >= analysis.entryPrice || analysis.stopLoss <= analysis.entryPrice)) {
      analysis.signal = "NO_TRADE";
      analysis.riskDecision = "INVALID_SELL_PRICES";
      analysis.explanation = `[RISK ENGINE REJECTED] Invalid SELL setup. TP must be < Entry, and SL must be > Entry.`;
      return analysis;
    }

    analysis.riskDecision = "APPROVED";
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
