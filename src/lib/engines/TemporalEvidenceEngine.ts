export type EvidenceDirection = "bull" | "bear" | "neutral";

export interface TemporalEvidence {
  direction: EvidenceDirection;
  score: number;
  groups: Set<string>;
  reasons: string[];
}

export interface TemporalState {
  currentDirection: EvidenceDirection;
  previousDirection: EvidenceDirection;
  transition:
    | "NONE"
    | "CONTINUATION"
    | "PULLBACK"
    | "RECOVERY"
    | "REVERSAL_DEVELOPING"
    | "REVERSAL_CONFIRMED"
    | "BREAKOUT"
    | "FALSE_BREAKOUT"
    | "RANGE"
    | "CHOPPY";
  marketRegime: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "BREAKOUT" | "REVERSAL" | "UNCLEAR";
  bullishScore: number;
  bearishScore: number;
  bullishGroups: string[];
  bearishGroups: string[];
  independentBullish: number;
  independentBearish: number;
  temporalAgreement: number;
  currentWeight: number;
  dataConfidence: number;
  currentObservation: any | null;
}

function text(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "value" in value) return String(value.value ?? "").toLowerCase();
  return String(value).toLowerCase();
}

function direction(value: any): EvidenceDirection {
  const v = text(value);
  if (!v) return "neutral";
  if (/(bull|upward|rising|positive|buy|higher high|higher low|green|above support|bounce|recovery|improving|expansion upward)/.test(v)) return "bull";
  if (/(bear|downward|falling|negative|sell|lower high|lower low|red|below resistance|rejection|weakening|expansion downward)/.test(v)) return "bear";
  return "neutral";
}

function observationsFromBatch(batch: any): any[] {
  const candidates = [
    batch?.frameObservations,
    batch?.unifiedMarketData?.frameObservations,
    batch?.unifiedMarketData?.historicalData?.frameObservations,
  ];
  for (const candidate of candidates) if (Array.isArray(candidate) && candidate.length) return candidate;
  return [];
}

function batchesFrom(progressive: any): any[] {
  if (Array.isArray(progressive)) return progressive;
  if (Array.isArray(progressive?.progressive)) return progressive.progressive;
  if (Array.isArray(progressive?.analyses)) return progressive.analyses;
  return progressive ? [progressive] : [];
}

function flattenObservations(progressive: any): Array<{ observation: any; batch: any; index: number }> {
  const out: Array<{ observation: any; batch: any; index: number }> = [];
  for (const batch of batchesFrom(progressive)) {
    const observations = observationsFromBatch(batch);
    observations.forEach((observation, index) => out.push({ observation, batch, index }));
  }
  return out;
}

function addEvidence(target: TemporalEvidence, group: string, dir: EvidenceDirection, weight: number, reason: string) {
  if (dir === "neutral") return;
  if (dir !== target.direction) return;
  target.score += weight;
  target.groups.add(group);
  if (target.reasons.length < 8 && reason) target.reasons.push(reason);
}

function numeric(value: any): number | null {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function latestPrice(observation: any): number | null {
  return numeric(observation?.price ?? observation?.currentPrice ?? observation?.marketData?.currentPrice);
}

export function analyzeTemporalEvidence(progressive: any): TemporalState {
  const batches = batchesFrom(progressive);
  const flat = flattenObservations(progressive);
  const latestBatch = batches[batches.length - 1] || {};
  const currentObservation = flat.length ? flat[flat.length - 1].observation : null;
  const previousObservation = flat.length > 1 ? flat[flat.length - 2].observation : null;

  const bull: TemporalEvidence = { direction: "bull", score: 0, groups: new Set(), reasons: [] };
  const bear: TemporalEvidence = { direction: "bear", score: 0, groups: new Set(), reasons: [] };

  const total = flat.length || batches.length;
  const recentWindow = flat.slice(Math.max(0, flat.length - 12));

  recentWindow.forEach(({ observation }, index) => {
    const age = recentWindow.length - index;
    const recency = 1 + ((recentWindow.length - age) / Math.max(1, recentWindow.length)) * 2.5;
    const multiplier = observation?.isPartial || latestBatch?.status === "PARTIAL" ? 1.35 : 1;

    addEvidence(bull, "structure", "bull", 2.4 * recency * multiplier, "Recent market structure supports upside.");
    addEvidence(bear, "structure", "bear", 2.4 * recency * multiplier, "Recent market structure supports downside.");

    const structure = observation?.structure ?? observation?.marketStructure;
    addEvidence(bull, "structure", direction(structure), 2.4 * recency * multiplier, "Structure direction is bullish.");
    addEvidence(bear, "structure", direction(structure), 2.4 * recency * multiplier, "Structure direction is bearish.");

    const candle = observation?.candle ?? observation?.candlestickBehavior;
    addEvidence(bull, "candle", direction(candle), 1.8 * recency * multiplier, "Recent candle behavior supports upside.");
    addEvidence(bear, "candle", direction(candle), 1.8 * recency * multiplier, "Recent candle behavior supports downside.");

    addEvidence(bull, "momentum", direction(observation?.momentum), 2.1 * recency * multiplier, "Momentum supports upside.");
    addEvidence(bear, "momentum", direction(observation?.momentum), 2.1 * recency * multiplier, "Momentum supports downside.");

    const indicators = observation?.indicators || observation?.indicatorState || {};
    for (const [name, value] of Object.entries(indicators)) {
      const d = direction(value);
      addEvidence(bull, `indicator:${name}`, d, 1.25 * recency * multiplier, `${name} supports upside.`);
      addEvidence(bear, `indicator:${name}`, d, 1.25 * recency * multiplier, `${name} supports downside.`);
    }

    const levels = observation?.levels || {};
    if (levels?.supportHeld === true || /hold|bounce/i.test(text(levels?.supportInteraction))) {
      bull.score += 1.5 * recency * multiplier;
      bull.groups.add("support");
      bull.reasons.push("Price is holding or bouncing from support.");
    }
    if (levels?.resistanceRejected === true || /reject|rejection/i.test(text(levels?.resistanceInteraction))) {
      bear.score += 1.5 * recency * multiplier;
      bear.groups.add("resistance");
      bear.reasons.push("Price is being rejected at resistance.");
    }
  });

  // Batch summaries provide historical context, but are intentionally much less
  // influential than the newest frame observations.
  batches.slice(-6).forEach((batch, index, recentBatches) => {
    const recency = 0.35 + ((index + 1) / Math.max(1, recentBatches.length)) * 0.65;
    const partialMultiplier = batch?.status === "PARTIAL" ? 1.5 : 1;
    const trendDir = direction(batch?.trend);
    const momentumDir = direction(batch?.momentum);
    const structureDir = direction(batch?.marketStructure ?? batch?.marketState);
    addEvidence(bull, "batchTrend", trendDir, 1.2 * recency * partialMultiplier, "Batch trend is bullish.");
    addEvidence(bear, "batchTrend", trendDir, 1.2 * recency * partialMultiplier, "Batch trend is bearish.");
    addEvidence(bull, "batchMomentum", momentumDir, 0.9 * recency * partialMultiplier, "Batch momentum is bullish.");
    addEvidence(bear, "batchMomentum", momentumDir, 0.9 * recency * partialMultiplier, "Batch momentum is bearish.");
    addEvidence(bull, "batchStructure", structureDir, 0.9 * recency * partialMultiplier, "Batch structure is bullish.");
    addEvidence(bear, "batchStructure", structureDir, 0.9 * recency * partialMultiplier, "Batch structure is bearish.");
  });

  const currentDirection = direction(
    currentObservation?.shortTermDirection ??
    currentObservation?.currentDirection ??
    currentObservation?.direction ??
    currentObservation?.marketState ??
    currentObservation?.trend ??
    latestBatch?.trend,
  );
  const previousDirection = direction(
    previousObservation?.shortTermDirection ??
    previousObservation?.currentDirection ??
    previousObservation?.direction ??
    previousObservation?.marketState ??
    previousObservation?.trend,
  );

  const currentMomentum = direction(currentObservation?.momentum);
  const currentStructure = direction(currentObservation?.structure ?? currentObservation?.marketStructure);
  const previousTrend = direction(latestBatch?.trend);
  const currentRegimeText = text(currentObservation?.marketRegime ?? currentObservation?.regime ?? latestBatch?.marketRegime);

  let transition: TemporalState["transition"] = "NONE";
  if (currentDirection !== "neutral" && previousDirection !== "neutral" && currentDirection === previousDirection) {
    transition = "CONTINUATION";
  } else if (previousTrend !== "neutral" && currentDirection !== "neutral" && previousTrend !== currentDirection) {
    const supportingGroups = currentDirection === "bull" ? bull.groups : bear.groups;
    const score = currentDirection === "bull" ? bull.score : bear.score;
    transition = supportingGroups.size >= 3 && score >= 10 ? "REVERSAL_CONFIRMED" : "REVERSAL_DEVELOPING";
  } else if (currentMomentum !== "neutral" && currentDirection !== "neutral" && currentMomentum !== currentDirection) {
    transition = "PULLBACK";
  } else if (currentStructure !== "neutral" && currentDirection !== "neutral" && currentStructure !== currentDirection) {
    transition = "RECOVERY";
  }

  const rangeLike = /range|sideways|chop|choppy|unclear/i.test(currentRegimeText);
  if (rangeLike) transition = /chop/i.test(currentRegimeText) ? "CHOPPY" : "RANGE";

  const dominantScore = Math.max(bull.score, bear.score);
  const combined = bull.score + bear.score;
  const temporalAgreement = combined > 0 ? dominantScore / combined : 0;
  const currentWeight = flat.length ? 1 + Math.min(1.5, flat.length / 8) : 1;

  let marketRegime: TemporalState["marketRegime"] = "UNCLEAR";
  if (transition === "REVERSAL_CONFIRMED" || transition === "REVERSAL_DEVELOPING") marketRegime = "REVERSAL";
  else if (transition === "BREAKOUT") marketRegime = "BREAKOUT";
  else if (transition === "RANGE" || transition === "CHOPPY") marketRegime = "RANGING";
  else if (bull.score > bear.score && temporalAgreement >= 0.62) marketRegime = "TRENDING_UP";
  else if (bear.score > bull.score && temporalAgreement >= 0.62) marketRegime = "TRENDING_DOWN";

  const latestDataConfidence = Number(latestBatch?.confidence);
  const dataConfidence = Number.isFinite(latestDataConfidence) ? Math.max(0, Math.min(100, latestDataConfidence)) : 60;

  return {
    currentDirection,
    previousDirection,
    transition,
    marketRegime,
    bullishScore: bull.score,
    bearishScore: bear.score,
    bullishGroups: [...bull.groups],
    bearishGroups: [...bear.groups],
    independentBullish: bull.groups.size,
    independentBearish: bear.groups.size,
    temporalAgreement,
    currentWeight,
    dataConfidence,
    currentObservation,
  };
}

export function collectFrameObservations(progressive: any): any[] {
  return flattenObservations(progressive).map(({ observation }) => observation);
}
