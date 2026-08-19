import type { Signal, Trend, UnifiedMarketContext } from "@/lib/types";

export interface FastSignalInput {
  symbol: string;
  timeframe: string;
  tradeDuration?: string;
  platform?: string;
  market?: Partial<UnifiedMarketContext> & Record<string, any>;
  progressive?: any;
}

export interface FastSignalResult {
  trend: Trend;
  signal: Signal;
  confidence: number;
  dataConfidence: number;
  signalQuality: "GOOD" | "FAIR" | "POOR" | "AVOID";
  readiness: "READY" | "GOOD" | "FAIR" | "NOT READY";
  marketState: string;
  momentum: string;
  strategyConsensus: string;
  bullishEvidence: string[];
  bearishEvidence: string[];
  invalidationConditions: string[];
  explanation: string;
  latencyMode: "LOCAL_TEXT";
  generatedAt: number;
}

function text(value: any): string {
  return String(value?.value ?? value ?? "").trim().toLowerCase();
}

function numeric(value: any): number | null {
  const n = Number(value?.value ?? value);
  return Number.isFinite(n) ? n : null;
}

function lastProgressive(progressive: any): any {
  if (Array.isArray(progressive)) return progressive[progressive.length - 1] || {};
  return progressive || {};
}

function direction(value: string): "bull" | "bear" | "neutral" {
  if (["bullish", "up", "strong bullish", "positive", "rising", "buy"].includes(value)) return "bull";
  if (["bearish", "down", "strong bearish", "negative", "falling", "sell"].includes(value)) return "bear";
  return "neutral";
}

/**
 * Hot path for entries: consumes already-derived text/structured market state.
 * It intentionally does not call an LLM, exchange REST API, database, or image model.
 * The progressive image analysis remains the expensive observation layer.
 */
export function generateFastSignal(input: FastSignalInput): FastSignalResult {
  const started = Date.now();
  const market = input.market || {};
  const previous = lastProgressive(input.progressive);
  const unified = (market.unifiedMarketData || previous.unifiedMarketData || {}) as any;

  const trendText = text(unified.trend || market.trend || previous.trend);
  const momentumText = text(unified.momentum || market.momentum || previous.momentum);
  const structureText = text(unified.marketStructure || market.marketStructure || previous.marketState);
  const regimeText = text(market.marketRegime || previous.marketState || unified.marketStructure);

  const trendDir = direction(trendText);
  const momentumDir = direction(momentumText);
  const structureDir = direction(structureText);

  const bullishEvidence: string[] = [];
  const bearishEvidence: string[] = [];

  if (trendDir === "bull") bullishEvidence.push(`Trend is ${trendText || "bullish"}.`);
  if (trendDir === "bear") bearishEvidence.push(`Trend is ${trendText || "bearish"}.`);
  if (momentumDir === "bull") bullishEvidence.push(`Momentum is ${momentumText || "bullish"}.`);
  if (momentumDir === "bear") bearishEvidence.push(`Momentum is ${momentumText || "bearish"}.`);
  if (structureDir === "bull") bullishEvidence.push(`Market structure supports upside.`);
  if (structureDir === "bear") bearishEvidence.push(`Market structure supports downside.`);

  const price = numeric(unified.currentPrice || market.currentPrice);
  const supports = (unified.supportLevels?.value || market.supportLevels?.value || market.supportLevels || []) as number[];
  const resistances = (unified.resistanceLevels?.value || market.resistanceLevels?.value || market.resistanceLevels || []) as number[];

  if (price !== null && Array.isArray(supports) && supports.some((level) => Number(level) < price)) {
    bullishEvidence.push("Price is above a visible support level.");
  }
  if (price !== null && Array.isArray(resistances) && resistances.some((level) => Number(level) > price)) {
    bearishEvidence.push("Price is below a visible resistance level.");
  }

  const conflict = Boolean(unified.dataConflict || market.dataConflict);
  const strongBull = bullishEvidence.length >= 2 && bearishEvidence.length === 0;
  const strongBear = bearishEvidence.length >= 2 && bullishEvidence.length === 0;
  const balanced = bullishEvidence.length > 0 && bearishEvidence.length > 0;

  let signal: Signal = "WAIT";
  let trend: Trend = "Sideways";

  if (trendDir === "bull") trend = "Bullish";
  else if (trendDir === "bear") trend = "Bearish";
  else if (strongBull) trend = "Bullish";
  else if (strongBear) trend = "Bearish";

  if (!conflict && strongBull) signal = "BUY";
  else if (!conflict && strongBear) signal = "SELL";

  const evidenceCount = Math.min(100, (bullishEvidence.length + bearishEvidence.length) * 20);
  const agreement = balanced ? 45 : Math.min(90, 55 + Math.max(bullishEvidence.length, bearishEvidence.length) * 10);
  const confidence = Math.round(Math.min(95, (evidenceCount * 0.45) + (agreement * 0.55)));
  const dataConfidence = unified.currentPrice || unified.trend || unified.momentum ? 90 : previous.confidence ? Math.min(85, Number(previous.confidence)) : 65;

  if (conflict || balanced || evidenceCount < 40) signal = "WAIT";

  const quality = signal === "WAIT" ? (conflict || balanced ? "FAIR" : "POOR") : confidence >= 80 ? "GOOD" : "FAIR";
  const readiness = signal === "WAIT" ? "NOT READY" : confidence >= 80 ? "READY" : "GOOD";

  const invalidationConditions = signal === "BUY"
    ? ["Bullish momentum/structure breaks or price loses the supporting level."]
    : signal === "SELL"
      ? ["Bearish momentum/structure breaks or price reclaims the opposing level."]
      : ["Wait for one directional side to gain clear evidence dominance."];

  return {
    trend,
    signal,
    confidence,
    dataConfidence,
    signalQuality: quality,
    readiness,
    marketState: regimeText || structureText || "Current progressive market state",
    momentum: momentumText || "Unknown",
    strategyConsensus: signal === "BUY" ? "Bullish" : signal === "SELL" ? "Bearish" : "Mixed",
    bullishEvidence,
    bearishEvidence,
    invalidationConditions,
    explanation: signal === "WAIT"
      ? "Fast text gate found insufficient or conflicting directional evidence; no entry is issued."
      : `Fast ${signal} signal from already-processed market text: ${Math.max(bullishEvidence.length, bearishEvidence.length)} supporting evidence items with no material opposing conflict.`,
    latencyMode: "LOCAL_TEXT",
    generatedAt: started,
  };
}
