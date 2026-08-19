export type SignalOutcome = "WIN" | "LOSS" | "EXPIRED" | "INVALIDATED";

export interface SignalPerformanceRecord {
  signal: string;
  strategy?: string;
  model?: string;
  symbol?: string;
  timeframe?: string;
  marketRegime?: string;
  confidence?: number;
  outcome: SignalOutcome;
  pnl?: number;
}

export interface SignalPerformanceSummary {
  sampleSize: number;
  wins: number;
  losses: number;
  expired: number;
  invalidated: number;
  winRate: number;
  averagePnl: number;
  profitFactor: number | null;
}

export function calculateSignalPerformance(records: SignalPerformanceRecord[]): SignalPerformanceSummary {
  const wins = records.filter((r) => r.outcome === "WIN").length;
  const losses = records.filter((r) => r.outcome === "LOSS").length;
  const expired = records.filter((r) => r.outcome === "EXPIRED").length;
  const invalidated = records.filter((r) => r.outcome === "INVALIDATED").length;
  const grossProfit = records.filter((r) => (r.pnl ?? 0) > 0).reduce((sum, r) => sum + (r.pnl ?? 0), 0);
  const grossLoss = Math.abs(records.filter((r) => (r.pnl ?? 0) < 0).reduce((sum, r) => sum + (r.pnl ?? 0), 0));
  const pnlValues = records.map((r) => r.pnl).filter((v): v is number => typeof v === "number");

  return {
    sampleSize: records.length,
    wins,
    losses,
    expired,
    invalidated,
    winRate: records.length ? Number(((wins / records.length) * 100).toFixed(2)) : 0,
    averagePnl: pnlValues.length ? Number((pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length).toFixed(4)) : 0,
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? null : 0,
  };
}

/**
 * Historical performance should influence weighting only after a meaningful
 * sample exists. This avoids overfitting to a handful of trades.
 */
export function hasSufficientSample(records: SignalPerformanceRecord[], minimum = 50): boolean {
  return records.length >= minimum;
}
