import type { Signal, Trend, UnifiedMarketContext } from "@/lib/types";

export interface FastSignalInput {
  symbol: string;
  timeframe: string;
  tradeDuration?: string;
  platform?: string;
  market?: Partial<UnifiedMarketContext> & Record<string, any>;
  progressive?: any;
  performance?: any;
}

export interface FastSignalResult {
  trend: Trend;
  primaryTrend?: string;
  shortTermDirection?: string;
  structureTransition?: string;
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
  marketRegime: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "BREAKOUT" | "REVERSAL" | "UNCLEAR";
  selectedStrategy: string;
  riskReward: number | null;
  transition: string;
  currentFrameCount: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
}

function numeric(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if ("value" in value) return numeric(value.value);
    if ("price" in value) return numeric(value.price);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function confidenceOf(value: any): number {
  if (value && typeof value === "object" && "confidence" in value) {
    const n = Number(value.confidence);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  }
  return 0;
}

function extractDirection(textValue: string | null | undefined): "bull" | "bear" | "neutral" {
  if (!textValue) return "neutral";
  const t = String(textValue).toLowerCase();
  if (/(bull|upward|higher|buy|long|hh|hl)/.test(t)) return "bull";
  if (/(bear|downward|lower|sell|short|lh|ll)/.test(t)) return "bear";
  return "neutral";
}

function asText(value: any): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(" ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function collectLevels(batches: any[], key: "supportLevels" | "resistanceLevels"): number[] {
  const values: number[] = [];
  for (const batch of batches) {
    const unified = batch?.unifiedMarketData || {};
    const container = unified[key];
    const raw = Array.isArray(container?.value) ? container.value : Array.isArray(container) ? container : [];
    for (const item of raw) {
      const n = numeric(item);
      if (n !== null) values.push(n);
    }

    const observations = Array.isArray(unified.frameObservations) ? unified.frameObservations : [];
    for (const observation of observations) {
      const levels = observation?.levels?.[key];
      if (Array.isArray(levels)) {
        for (const item of levels) {
          const n = numeric(item);
          if (n !== null) values.push(n);
        }
      }
    }
  }
  return values;
}

function stableLevel(levels: number[], currentPrice: number | null, direction: "support" | "resistance"): number | null {
  if (!levels.length) return null;
  const sorted = [...levels].sort((a, b) => a - b);
  const tolerance = currentPrice !== null ? Math.max(Math.abs(currentPrice) * 0.0015, 0.01) : Infinity;
  const clusters: number[][] = [];

  for (const level of sorted) {
    const existing = clusters.find(cluster => Math.abs(cluster[cluster.length - 1] - level) <= tolerance);
    if (existing) existing.push(level);
    else clusters.push([level]);
  }

  const ranked = clusters
    .map(cluster => ({
      value: cluster.reduce((sum, n) => sum + n, 0) / cluster.length,
      count: cluster.length,
    }))
    .sort((a, b) => b.count - a.count || (direction === "support" ? b.value - a.value : a.value - b.value));

  if (currentPrice === null) return ranked[0]?.value ?? null;

  const valid = ranked.filter(item => direction === "support" ? item.value < currentPrice : item.value > currentPrice);
  return valid[0]?.value ?? null;
}

function latestDirectionalEvidence(batches: any[]): { bull: number; bear: number; groups: Set<string> } {
  const groups = new Set<string>();
  let bull = 0;
  let bear = 0;
  const latest = batches[batches.length - 1] || {};
  const unified = latest?.unifiedMarketData || {};
  const evidence = unified.evidenceGroups || {};

  const groupNames = ["structure", "candle", "momentum", "indicators", "supportResistance", "volatility", "volume", "mtf"];
  for (const name of groupNames) {
    const text = asText(evidence[name]).toLowerCase();
    const dir = extractDirection(text);
    if (dir === "bull") { bull++; groups.add(name); }
    if (dir === "bear") { bear++; groups.add(name); }
  }

  // A structured frame observation is evidence for the corresponding group,
  // but the same group can only count once. This prevents repeated frames from
  // artificially inflating confluence.
  const observations = Array.isArray(unified.frameObservations) ? unified.frameObservations : [];
  const recent = observations.slice(-5);
  for (const observation of recent) {
    if (extractDirection(observation.structure) === "bull") { bull = Math.max(bull, 1); groups.add("structure"); }
    if (extractDirection(observation.structure) === "bear") { bear = Math.max(bear, 1); groups.add("structure"); }
    if (extractDirection(observation.momentum) === "bull") { bull = Math.max(bull, 1); groups.add("momentum"); }
    if (extractDirection(observation.momentum) === "bear") { bear = Math.max(bear, 1); groups.add("momentum"); }
  }

  return { bull, bear, groups };
}

export function generateFastSignal(input: FastSignalInput): FastSignalResult {
  const started = Date.now();
  const batches = Array.isArray(input.progressive) ? input.progressive.filter(Boolean) : [];
  const latestBatch = batches[batches.length - 1] || {};
  const unified = latestBatch?.unifiedMarketData || {};
  const temporal = unified.temporalState || {};

  // Aggregate the latest structured snapshot, while retaining older batches only
  // for stability/confirmation. Never average frames into a simple vote.
  const currentPrice = numeric(unified.currentPrice) ?? numeric(latestBatch.currentPrice);
  const supportLevels = collectLevels(batches, "supportLevels");
  const resistanceLevels = collectLevels(batches, "resistanceLevels");
  const support = stableLevel(supportLevels, currentPrice, "support");
  const resistance = stableLevel(resistanceLevels, currentPrice, "resistance");

  const structureDir = extractDirection(asText(unified.marketStructure?.value ?? latestBatch.marketStructure));
  const momentumDir = extractDirection(asText(unified.momentum?.value ?? latestBatch.momentum));
  const trendDir = extractDirection(asText(unified.trend?.value ?? latestBatch.trend));

  const { bull: latestBullGroups, bear: latestBearGroups } = latestDirectionalEvidence(batches);
  const stableTrend = batches.slice(-4).map(batch => extractDirection(asText(batch?.unifiedMarketData?.trend?.value ?? batch?.trend))).filter(d => d !== "neutral");
  const stableBullTrend = stableTrend.length >= 2 && stableTrend.filter(d => d === "bull").length >= Math.ceil(stableTrend.length * 0.75);
  const stableBearTrend = stableTrend.length >= 2 && stableTrend.filter(d => d === "bear").length >= Math.ceil(stableTrend.length * 0.75);

  const isBullishAlignment = (trendDir === "bull" || stableBullTrend) && (structureDir === "bull" || momentumDir === "bull");
  const isBearishAlignment = (trendDir === "bear" || stableBearTrend) && (structureDir === "bear" || momentumDir === "bear");

  const conflicts = Array.isArray(temporal.conflicts) ? temporal.conflicts : [];
  const hasContradiction = unified.dataConflict === true || conflicts.length > 0 || (latestBullGroups >= 2 && latestBearGroups >= 2);

  const transition = temporal.transition || latestBatch.structureTransition || "NONE";
  const confirmation = temporal.confirmationStatus || latestBatch.confirmationStatus || "UNCLEAR";
  const isConfirmed = confirmation === "CONFIRMED" || transition === "REVERSAL_CONFIRMED" || transition === "CONTINUATION" || transition === "BREAKOUT";
  const isDeveloping = confirmation === "DEVELOPING" || transition === "REVERSAL_DEVELOPING" || transition === "PULLBACK" || transition === "RECOVERY";

  // Require independent evidence categories. Trend alone is never enough.
  const candidateSignal: Signal = latestBullGroups >= 3 && isBullishAlignment && !hasContradiction
    ? "BUY"
    : latestBearGroups >= 3 && isBearishAlignment && !hasContradiction
      ? "SELL"
      : "WAIT";

  let riskReward: number | null = null;
  let entryPrice: number | null = null;
  let stopLoss: number | null = null;
  let takeProfit: number | null = null;
  let riskDecision: "APPROVED" | "REJECTED" | "WAIT" = "WAIT";

  // Exact numeric values are mandatory. Visual descriptions alone must never
  // be converted into fabricated prices.
  if (currentPrice !== null && support !== null && resistance !== null) {
    entryPrice = currentPrice;
    if (candidateSignal === "BUY") {
      stopLoss = support;
      takeProfit = resistance;
      const risk = entryPrice - stopLoss;
      const reward = takeProfit - entryPrice;
      riskReward = risk > 0 && reward > 0 ? reward / risk : null;
    } else if (candidateSignal === "SELL") {
      stopLoss = resistance;
      takeProfit = support;
      const risk = stopLoss - entryPrice;
      const reward = entryPrice - takeProfit;
      riskReward = risk > 0 && reward > 0 ? reward / risk : null;
    }

    if (candidateSignal !== "WAIT") {
      riskDecision = riskReward !== null && riskReward >= 1.2 ? "APPROVED" : "REJECTED";
    }
  }

  const finalSignal: Signal = candidateSignal !== "WAIT" && riskDecision === "APPROVED" && isConfirmed
    ? candidateSignal
    : "WAIT";

  const latestVisualConfidence = Math.max(
    confidenceOf(unified.currentPrice),
    confidenceOf(unified.trend),
    confidenceOf(unified.marketStructure),
    confidenceOf(unified.momentum),
    Number(latestBatch.confidence) || 0,
  );

  const evidenceScore = Math.min(
    100,
    Math.max(latestBullGroups, latestBearGroups) * 15 +
      (isConfirmed ? 25 : isDeveloping ? 10 : 0) +
      (stableBullTrend || stableBearTrend ? 15 : 0) +
      (!hasContradiction ? 10 : 0) +
      (currentPrice !== null ? 10 : 0) +
      (support !== null && resistance !== null ? 10 : 0),
  );

  // Confidence is evidence quality, not win probability.
  const confidence = finalSignal !== "WAIT"
    ? Math.max(75, evidenceScore)
    : Math.min(70, Math.max(evidenceScore, latestVisualConfidence));

  const dataConfidence = Math.max(latestVisualConfidence, unified?.currentPrice?.confidence || 0);
  const marketRegime = (temporal.regime || latestBatch.marketRegime || "UNCLEAR") as FastSignalResult["marketRegime"];

  let explanation = "WAIT: Insufficient independent confluence.";
  if (candidateSignal !== "WAIT" && riskDecision === "WAIT") {
    explanation = "WAIT: Exact current price, invalidation and opposing target levels are not all reliably available from visual evidence.";
  } else if (candidateSignal !== "WAIT" && riskDecision === "REJECTED") {
    explanation = `WAIT: Risk Gate rejected the setup because required risk/reward is below 1.2 (R:R ${riskReward?.toFixed(2) ?? "unavailable"}).`;
  } else if (candidateSignal !== "WAIT" && !isConfirmed) {
    explanation = "WAIT: Directional setup is developing but the trigger is not confirmed.";
  } else if (hasContradiction) {
    explanation = "WAIT: Conflicting evidence detected in the current snapshot.";
  } else if (finalSignal !== "WAIT") {
    explanation = `${finalSignal} APPROVED: Independent confluence, confirmation and Risk Gate passed (R:R ${riskReward?.toFixed(2)}).`;
  }

  return {
    trend: trendDir === "bull" || stableBullTrend ? "Bullish" : trendDir === "bear" || stableBearTrend ? "Bearish" : "Sideways",
    primaryTrend: stableBullTrend ? "Bullish" : stableBearTrend ? "Bearish" : undefined,
    shortTermDirection: momentumDir === "bull" ? "Bullish" : momentumDir === "bear" ? "Bearish" : "Neutral",
    structureTransition: transition,
    signal: finalSignal,
    confidence,
    dataConfidence,
    signalQuality: finalSignal !== "WAIT" ? (riskReward !== null && riskReward > 2 ? "GOOD" : "FAIR") : "AVOID",
    readiness: finalSignal !== "WAIT" ? "READY" : "NOT READY",
    marketState: `${marketRegime} (${transition})`,
    momentum: momentumDir === "bull" ? "Bullish" : momentumDir === "bear" ? "Bearish" : "Neutral",
    strategyConsensus: finalSignal !== "WAIT" ? "Aligned" : "Mixed",
    bullishEvidence: [
      latestBullGroups >= 3 ? "Three or more independent bullish evidence groups aligned" : "Insufficient bullish alignment",
      stableBullTrend ? "Bullish direction persisted across recent batches" : "Recent trend persistence is insufficient",
      isConfirmed && candidateSignal === "BUY" ? "Setup trigger confirmed" : "Trigger not confirmed",
    ],
    bearishEvidence: [
      latestBearGroups >= 3 ? "Three or more independent bearish evidence groups aligned" : "Insufficient bearish alignment",
      stableBearTrend ? "Bearish direction persisted across recent batches" : "Recent trend persistence is insufficient",
      isConfirmed && candidateSignal === "SELL" ? "Setup trigger confirmed" : "Trigger not confirmed",
    ],
    invalidationConditions: candidateSignal === "BUY" && stopLoss !== null
      ? [`Close below visual support at ${stopLoss}`]
      : candidateSignal === "SELL" && stopLoss !== null
        ? [`Close above visual resistance at ${stopLoss}`]
        : ["Missing exact invalidation data"],
    explanation,
    latencyMode: "LOCAL_TEXT",
    generatedAt: started,
    evidenceScore,
    marketRegime,
    selectedStrategy: "Deterministic Hard Gate Engine",
    riskReward,
    transition,
    currentFrameCount: batches.length,
    entryPrice,
    stopLoss,
    takeProfit,
  };
}
