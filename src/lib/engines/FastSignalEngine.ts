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

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function direction(value: string): "bull" | "bear" | "neutral" {
  const v = value.toLowerCase();
  if (/(bull|upward|rising|positive|buy|higher high|higher low|strong green|continuation)/.test(v)) return "bull";
  if (/(bear|downward|falling|negative|sell|lower high|lower low|strong red|rejection)/.test(v)) return "bear";
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

  if (values.length === 0) {
    const fallback = Number(previous?.dataConfidence ?? previous?.confidence);
    return Number.isFinite(fallback) ? Math.min(100, Math.max(0, fallback)) : 65;
  }

  // The final signal can never claim more confidence than the evidence supplied
  // by the progressive/vision stage. This prevents a 60–65% visual observation
  // from becoming an unjustified 80–90% trade signal.
  return Math.min(...values);
}

/**
 * Hot entry path. It consumes all completed progressive batches plus any
 * supplied partial batch. It never calls an LLM, exchange API or database.
 */
export function generateFastSignal(input: FastSignalInput): FastSignalResult {
  const started = Date.now();
  const market = input.market || {};
  const batches = collectBatches(input.progressive);
  const previous = batches[batches.length - 1] || {};
  const unified = (market.unifiedMarketData || previous.unifiedMarketData || {}) as any;

  const trendVotes = batches.map((b) => direction(text(b.trend || b.strategyConsensus))).filter((v) => v !== "neutral");
  const momentumVotes = batches.map((b) => direction(text(b.momentum))).filter((v) => v !== "neutral");
  const structureVotes = batches.map((b) => direction(text(b.marketStructure || b.marketState || b.candlestickBehavior))).filter((v) => v !== "neutral");

  const bullishEvidence: string[] = [];
  const bearishEvidence: string[] = [];

  const latestTrend = direction(text(unified.trend || market.trend || previous.trend));
  const latestMomentum = direction(text(unified.momentum || market.momentum || previous.momentum));
  const latestStructure = direction(text(unified.marketStructure || market.marketStructure || previous.marketState));

  if (latestTrend === "bull") bullishEvidence.push("Latest progressive trend is bullish.");
  if (latestTrend === "bear") bearishEvidence.push("Latest progressive trend is bearish.");
  if (latestMomentum === "bull") bullishEvidence.push("Latest progressive momentum supports upside.");
  if (latestMomentum === "bear") bearishEvidence.push("Latest progressive momentum supports downside.");
  if (latestStructure === "bull") bullishEvidence.push("Latest market structure supports upside.");
  if (latestStructure === "bear") bearishEvidence.push("Latest market structure supports downside.");

  const positiveIndicatorText = batches.flatMap((b) => Object.values(b.indicatorState || {})).map((v) => text(v)).filter((v) => v && direction(v) === "bull");
  const negativeIndicatorText = batches.flatMap((b) => Object.values(b.indicatorState || {})).map((v) => text(v)).filter((v) => v && direction(v) === "bear");
  if (positiveIndicatorText.length) bullishEvidence.push(`Indicators provide ${positiveIndicatorText.length} bullish confirmation${positiveIndicatorText.length > 1 ? "s" : ""}.`);
  if (negativeIndicatorText.length) bearishEvidence.push(`Indicators provide ${negativeIndicatorText.length} bearish confirmation${negativeIndicatorText.length > 1 ? "s" : ""}.`);

  const price = numeric(unified.currentPrice || market.currentPrice);
  const supports = asArray(unified.supportLevels?.value || market.supportLevels?.value || market.supportLevels);
  const resistances = asArray(unified.resistanceLevels?.value || market.resistanceLevels?.value || market.resistanceLevels);

  if (price !== null && supports.some((level) => Number(level) < price)) bullishEvidence.push("Price is above a visible support level.");
  if (price !== null && resistances.some((level) => Number(level) > price)) bearishEvidence.push("Price is below a visible resistance level.");

  const bullTrendCount = trendVotes.filter((v) => v === "bull").length;
  const bearTrendCount = trendVotes.filter((v) => v === "bear").length;
  const bullMomentumCount = momentumVotes.filter((v) => v === "bull").length;
  const bearMomentumCount = momentumVotes.filter((v) => v === "bear").length;
  const bullStructureCount = structureVotes.filter((v) => v === "bull").length;
  const bearStructureCount = structureVotes.filter((v) => v === "bear").length;

  const conflict = Boolean(unified.dataConflict || market.dataConflict);
  const bullishScore = bullTrendCount * 2 + bullMomentumCount * 2 + bullStructureCount + positiveIndicatorText.length;
  const bearishScore = bearTrendCount * 2 + bearMomentumCount * 2 + bearStructureCount + negativeIndicatorText.length;
  const scoreGap = Math.abs(bullishScore - bearishScore);

  let signal: Signal = "WAIT";
  let trend: Trend = "Sideways";
  if (bullishScore > bearishScore && bullishScore > 0) trend = "Bullish";
  else if (bearishScore > bullishScore && bearishScore > 0) trend = "Bearish";

  // A single progressive batch must have at least three independent evidence
  // categories before a directional signal is allowed. More batches can add
  // temporal confirmation, but do not replace missing evidence categories.
  const sourceConfidenceValue = sourceConfidence(batches, previous);
  const independentBull = [
    bullTrendCount > 0,
    bullMomentumCount > 0,
    bullStructureCount > 0,
    positiveIndicatorText.length > 0,
    bullishEvidence.some((item) => /support level/i.test(item)),
  ].filter(Boolean).length;
  const independentBear = [
    bearTrendCount > 0,
    bearMomentumCount > 0,
    bearStructureCount > 0,
    negativeIndicatorText.length > 0,
    bearishEvidence.some((item) => /resistance level/i.test(item)),
  ].filter(Boolean).length;

  const minimumDirectionalScore = batches.length >= 2 ? 5 : 6;
  const minimumIndependentEvidence = batches.length >= 2 ? 3 : 3;
  const dominantBull = !conflict
    && bullishScore >= minimumDirectionalScore
    && scoreGap >= 3
    && bearishScore <= 1
    && independentBull >= minimumIndependentEvidence;
  const dominantBear = !conflict
    && bearishScore >= minimumDirectionalScore
    && scoreGap >= 3
    && bullishScore <= 1
    && independentBear >= minimumIndependentEvidence;

  if (dominantBull) signal = "BUY";
  else if (dominantBear) signal = "SELL";

  const evidenceScore = Math.min(100, Math.round(
    Math.min(60, Math.max(bullishScore, bearishScore) * 7)
    + Math.min(20, scoreGap * 4)
    + Math.min(20, Math.max(independentBull, independentBear) * 5),
  ));

  // Confidence is bounded by the quality of the source data and the strength
  // of independent evidence. It can never exceed the weakest progressive batch.
  const evidenceCap = Math.min(100, Math.max(35, evidenceScore));
  const temporalBonus = batches.length >= 3 && scoreGap >= 4 ? 5 : batches.length >= 2 && scoreGap >= 4 ? 3 : 0;
  const rawConfidence = signal === "WAIT"
    ? Math.min(69, Math.max(40, 40 + scoreGap * 4 + Math.max(0, independentBull + independentBear - 2) * 3))
    : Math.min(95, 55 + Math.min(25, scoreGap * 4) + Math.min(10, Math.max(independentBull, independentBear) * 3) + temporalBonus);
  const confidence = Math.min(sourceConfidenceValue, evidenceCap, rawConfidence);

  const latestConfidence = Number(previous.confidence);
  const dataConfidence = unified.currentPrice || unified.trend || unified.momentum
    ? 90
    : Number.isFinite(latestConfidence) ? Math.min(90, Math.max(0, latestConfidence)) : 65;

  const quality = signal === "WAIT"
    ? (confidence >= 55 ? "FAIR" : "POOR")
    : confidence >= 80 && independentBull + independentBear >= 4 ? "GOOD" : "FAIR";
  const readiness = signal === "WAIT" ? "NOT READY" : confidence >= 80 ? "READY" : "GOOD";

  const invalidationConditions = signal === "BUY"
    ? ["Bullish trend/momentum alignment breaks or price loses the supporting structure."]
    : signal === "SELL"
      ? ["Bearish trend/momentum alignment breaks or price reclaims the opposing structure."]
      : ["Wait for trend, momentum and structure to align with a clear directional edge."];

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
      ? `Fast gate evaluated ${batchLabel}; evidence is not sufficiently dominant for a directional entry.`
      : `Fast ${signal} signal from ${batchLabel}; directional evidence is dominant with no material opposing conflict.`,
    latencyMode: "LOCAL_TEXT",
    generatedAt: started,
  };
}
