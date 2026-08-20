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

  const minimumDirectionalScore = batches.length >= 2 ? 5 : 4;
  const dominantBull = !conflict && bullishScore >= minimumDirectionalScore && scoreGap >= 3 && bearishScore <= 1;
  const dominantBear = !conflict && bearishScore >= minimumDirectionalScore && scoreGap >= 3 && bullishScore <= 1;

  if (dominantBull) signal = "BUY";
  else if (dominantBear) signal = "SELL";

  const totalEvidence = bullishScore + bearishScore;
  const confidence = signal === "WAIT"
    ? Math.min(69, Math.round(40 + Math.min(25, scoreGap * 4)))
    : Math.min(95, Math.round(60 + Math.min(35, scoreGap * 5)));

  const latestConfidence = Number(previous.confidence);
  const dataConfidence = unified.currentPrice || unified.trend || unified.momentum
    ? 90
    : Number.isFinite(latestConfidence) ? Math.min(90, Math.max(0, latestConfidence)) : 65;

  const quality = signal === "WAIT"
    ? (scoreGap >= 2 ? "FAIR" : "POOR")
    : confidence >= 85 ? "GOOD" : "FAIR";
  const readiness = signal === "WAIT" ? "NOT READY" : confidence >= 85 ? "READY" : "GOOD";

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
