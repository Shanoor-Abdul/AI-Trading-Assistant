import type { Signal, Trend, UnifiedMarketContext } from "@/lib/types";

export interface FastSignalInput {
  symbol: string;
  timeframe: string;
  tradeDuration?: string;
  platform?: string;
  market?: Partial<UnifiedMarketContext> & Record<string, any>;
  progressive?: any;
  performance?: {
    sampleSize?: number;
    winRate?: number;
    profitFactor?: number | null;
    byStrategy?: Record<string, { sampleSize: number; winRate: number }>;
  };
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
  evidenceScore: number;
  marketRegime: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "BREAKOUT" | "UNCLEAR";
  selectedStrategy: string;
  riskReward: number | null;
}

function text(value: any): string {
  return String(value?.value ?? value ?? "").trim().toLowerCase();
}

function numeric(value: any): number | null {
  const n = Number(value?.value ?? value);
  return Number.isFinite(n) ? n : null;
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function direction(value: string): "bull" | "bear" | "neutral" {
  const v = value.toLowerCase();
  if (/(bull|upward|rising|positive|buy|higher high|higher low|strong green|continuation|above support|breakout up|expanding upward)/.test(v)) return "bull";
  if (/(bear|downward|falling|negative|sell|lower high|lower low|strong red|rejection|below resistance|breakout down|expanding downward)/.test(v)) return "bear";
  return "neutral";
}

function collectBatches(progressive: any): any[] {
  if (!progressive) return [];
  if (Array.isArray(progressive)) return progressive;
  if (Array.isArray(progressive?.analyses)) return progressive.analyses;
  if (Array.isArray(progressive?.progressive)) return progressive.progressive;
  if (progressive?.batchId !== undefined || progressive?.trend || progressive?.marketState) return [progressive];
  return [];
}

function sourceConfidence(batches: any[], previous: any): number {
  const values = batches
    .map((batch) => Number(batch?.confidence))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  if (!values.length) {
    const fallback = Number(previous?.dataConfidence ?? previous?.confidence);
    return Number.isFinite(fallback) ? Math.min(100, Math.max(0, fallback)) : 65;
  }
  return Math.min(...values);
}

function regimeFromBatches(batches: any[]): FastSignalResult["marketRegime"] {
  const trends = batches.map((b) => direction(text(b.trend))).filter((v) => v !== "neutral");
  if (!trends.length) return "UNCLEAR";
  const bull = trends.filter((v) => v === "bull").length;
  const bear = trends.length - bull;
  const last = trends[trends.length - 1];
  const previous = trends.slice(0, -1);
  const changed = previous.length > 0 && previous[previous.length - 1] !== last;
  if (changed && batches.length >= 2) return "BREAKOUT";
  if (bull === trends.length) return "TRENDING_UP";
  if (bear === trends.length) return "TRENDING_DOWN";
  return "RANGING";
}

function strategyForRegime(regime: FastSignalResult["marketRegime"]): string {
  switch (regime) {
    case "TRENDING_UP": return "Trend Following / Momentum";
    case "TRENDING_DOWN": return "Trend Following / Momentum";
    case "BREAKOUT": return "Breakout";
    case "RANGING": return "Mean Reversion";
    default: return "WAIT / Confirmation";
  }
}

function numberFromObject(obj: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = numeric(obj?.[key]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Low-latency reasoning gate. It consumes only structured progressive text/data.
 * No screenshot, exchange, database, or network call is made here.
 */
export function generateFastSignal(input: FastSignalInput): FastSignalResult {
  const started = Date.now();
  const market = input.market || {};
  const batches = collectBatches(input.progressive);
  const previous = batches[batches.length - 1] || {};
  const unified = (market.unifiedMarketData || previous.unifiedMarketData || {}) as any;
  const regime = regimeFromBatches(batches);
  const selectedStrategy = strategyForRegime(regime);

  const trendVotes = batches.map((b) => direction(text(b.trend || b.strategyConsensus))).filter((v) => v !== "neutral");
  const momentumVotes = batches.map((b) => direction(text(b.momentum))).filter((v) => v !== "neutral");
  const structureVotes = batches.map((b) => direction(text(b.marketStructure || b.marketState || b.candlestickBehavior))).filter((v) => v !== "neutral");
  const bullishEvidence: string[] = [];
  const bearishEvidence: string[] = [];

  const latestTrend = direction(text(unified.trend || market.trend || previous.trend));
  const latestMomentum = direction(text(unified.momentum || market.momentum || previous.momentum));
  const latestStructure = direction(text(unified.marketStructure || market.marketStructure || previous.marketStructure || previous.marketState));

  if (latestTrend === "bull") bullishEvidence.push("Trend structure supports upside.");
  if (latestTrend === "bear") bearishEvidence.push("Trend structure supports downside.");
  if (latestMomentum === "bull") bullishEvidence.push("Momentum supports upside.");
  if (latestMomentum === "bear") bearishEvidence.push("Momentum supports downside.");
  if (latestStructure === "bull") bullishEvidence.push("Market/candle structure supports upside.");
  if (latestStructure === "bear") bearishEvidence.push("Market/candle structure supports downside.");

  const indicatorValues = batches.flatMap((b) => Object.values(b.indicatorState || {})).map((v) => text(v)).filter(Boolean);
  const positiveIndicatorText = indicatorValues.filter((v) => direction(v) === "bull");
  const negativeIndicatorText = indicatorValues.filter((v) => direction(v) === "bear");
  if (positiveIndicatorText.length) bullishEvidence.push(`Indicators provide ${positiveIndicatorText.length} bullish confirmation${positiveIndicatorText.length > 1 ? "s" : ""}.`);
  if (negativeIndicatorText.length) bearishEvidence.push(`Indicators provide ${negativeIndicatorText.length} bearish confirmation${negativeIndicatorText.length > 1 ? "s" : ""}.`);

  const price = numberFromObject(unified, ["currentPrice", "price", "close"])
    ?? numberFromObject(market, ["currentPrice", "price", "close"]);
  const supports = asArray(unified.supportLevels?.value || market.supportLevels?.value || market.supportLevels).map(Number).filter(Number.isFinite);
  const resistances = asArray(unified.resistanceLevels?.value || market.resistanceLevels?.value || market.resistanceLevels).map(Number).filter(Number.isFinite);
  const supportBelow = price !== null && supports.some((level) => level < price);
  const resistanceAbove = price !== null && resistances.some((level) => level > price);
  if (supportBelow) bullishEvidence.push("Price is holding above a visible support level.");
  if (resistanceAbove) bearishEvidence.push("Price is below a visible resistance level.");

  const bullTrendCount = trendVotes.filter((v) => v === "bull").length;
  const bearTrendCount = trendVotes.filter((v) => v === "bear").length;
  const bullMomentumCount = momentumVotes.filter((v) => v === "bull").length;
  const bearMomentumCount = momentumVotes.filter((v) => v === "bear").length;
  const bullStructureCount = structureVotes.filter((v) => v === "bull").length;
  const bearStructureCount = structureVotes.filter((v) => v === "bear").length;

  const bullishScore = bullTrendCount * 2 + bullMomentumCount * 2 + bullStructureCount * 2 + positiveIndicatorText.length;
  const bearishScore = bearTrendCount * 2 + bearMomentumCount * 2 + bearStructureCount * 2 + negativeIndicatorText.length;
  const scoreGap = Math.abs(bullishScore - bearishScore);
  const conflict = Boolean(unified.dataConflict || market.dataConflict) || Math.abs(bullTrendCount - bearTrendCount) === 0 && trendVotes.length > 1;

  const independentBull = [
    bullTrendCount > 0,
    bullMomentumCount > 0,
    bullStructureCount > 0,
    positiveIndicatorText.length > 0,
    supportBelow,
  ].filter(Boolean).length;
  const independentBear = [
    bearTrendCount > 0,
    bearMomentumCount > 0,
    bearStructureCount > 0,
    negativeIndicatorText.length > 0,
    resistanceAbove,
  ].filter(Boolean).length;

  const sourceConfidenceValue = sourceConfidence(batches, previous);
  const temporalAgreement = batches.length > 1
    ? Math.max(bullTrendCount, bearTrendCount) / Math.max(1, trendVotes.length)
    : 0;

  const chosenDirection = bullishScore > bearishScore ? "bull" : bearishScore > bullishScore ? "bear" : "neutral";
  const independentEvidence = chosenDirection === "bull" ? independentBull : independentBear;
  const opposingScore = chosenDirection === "bull" ? bearishScore : bullishScore;

  // Entry quality is deliberately stricter than trend detection. A directional
  // signal needs three independent evidence categories, temporal agreement, and
  // no material opposing evidence.
  const minimumScore = batches.length >= 3 ? 6 : batches.length >= 2 ? 7 : 8;
  const dominant = chosenDirection !== "neutral"
    && !conflict
    && Math.max(bullishScore, bearishScore) >= minimumScore
    && scoreGap >= 3
    && opposingScore <= 2
    && independentEvidence >= 3
    && (batches.length === 1 || temporalAgreement >= 0.67);

  let signal: Signal = dominant ? (chosenDirection === "bull" ? "BUY" : "SELL") : "WAIT";
  let trend: Trend = "Sideways";
  if (bullishScore > bearishScore && bullishScore > 0) trend = "Bullish";
  else if (bearishScore > bullishScore && bearishScore > 0) trend = "Bearish";

  // Risk/reward is used only when concrete entry/SL/TP data is available.
  const entry = numberFromObject(unified, ["entryPrice", "currentPrice", "price"])
    ?? numberFromObject(market, ["entryPrice", "currentPrice", "price"]);
  const stop = numberFromObject(unified, ["stopLoss", "sl"])
    ?? numberFromObject(market, ["stopLoss", "sl"]);
  const target = numberFromObject(unified, ["takeProfit", "tp"])
    ?? numberFromObject(market, ["takeProfit", "tp"]);
  const risk = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  const reward = entry !== null && target !== null ? Math.abs(target - entry) : null;
  const riskReward = risk && reward !== null && risk > 0 ? reward / risk : null;
  if (signal !== "WAIT" && riskReward !== null && riskReward < 1) {
    signal = "WAIT";
  }

  const evidenceScore = Math.min(100, Math.round(
    Math.min(45, Math.max(bullishScore, bearishScore) * 5)
      + Math.min(20, scoreGap * 4)
      + Math.min(20, Math.max(independentBull, independentBear) * 4)
      + (temporalAgreement >= 0.8 ? 10 : temporalAgreement >= 0.67 ? 5 : 0)
      + (riskReward !== null && riskReward >= 1.5 ? 5 : 0),
  ));

  const evidenceCap = Math.min(100, Math.max(35, evidenceScore));
  const temporalBonus = batches.length >= 3 && temporalAgreement >= 0.8 ? 5 : batches.length >= 2 && temporalAgreement >= 0.67 ? 2 : 0;
  const rawConfidence = signal === "WAIT"
    ? Math.min(69, Math.max(40, 42 + scoreGap * 3 + Math.max(0, independentEvidence - 2) * 4))
    : Math.min(95, 55 + Math.min(20, scoreGap * 3) + Math.min(12, independentEvidence * 3) + temporalBonus);
  const confidence = Math.min(sourceConfidenceValue, evidenceCap, rawConfidence);

  const latestConfidence = Number(previous.confidence);
  const dataConfidence = Number.isFinite(latestConfidence)
    ? Math.min(90, Math.max(0, latestConfidence))
    : 65;

  const quality = signal === "WAIT"
    ? (confidence >= 55 ? "FAIR" : "POOR")
    : confidence >= 80 && independentEvidence >= 4 ? "GOOD" : "FAIR";
  const readiness = signal === "WAIT" ? "NOT READY" : confidence >= 80 && independentEvidence >= 4 ? "READY" : "GOOD";

  const invalidationConditions = signal === "BUY"
    ? ["Bullish trend, momentum or structure alignment breaks.", "Price loses the supporting structure."]
    : signal === "SELL"
      ? ["Bearish trend, momentum or structure alignment breaks.", "Price reclaims the opposing structure."]
      : ["Wait for trend, momentum and structure to align with a clear directional edge.", "Avoid entry while evidence remains mixed or incomplete."];

  const batchLabel = batches.length ? `${batches.length} progressive batch${batches.length > 1 ? "es" : ""}` : "latest progressive state";

  return {
    trend,
    signal,
    confidence,
    dataConfidence,
    signalQuality: quality,
    readiness,
    marketState: text(market.marketRegime || previous.marketState || unified.marketStructure) || "Current progressive market state",
    momentum: text(unified.momentum || market.momentum || previous.momentum) || "Unknown",
    strategyConsensus: signal === "BUY" ? "Bullish" : signal === "SELL" ? "Bearish" : "Mixed",
    bullishEvidence,
    bearishEvidence,
    invalidationConditions,
    explanation: signal === "WAIT"
      ? `Fast gate evaluated ${batchLabel}; ${selectedStrategy} is not actionable until independent evidence aligns.`
      : `Fast ${signal} signal from ${batchLabel}; ${selectedStrategy} is compatible with the detected ${regime.toLowerCase().replace(/_/g, " ")} regime.`,
    latencyMode: "LOCAL_TEXT",
    generatedAt: started,
    evidenceScore,
    marketRegime: regime,
    selectedStrategy,
    riskReward,
  };
}
