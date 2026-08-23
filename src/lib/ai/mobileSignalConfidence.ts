type Direction = "bullish" | "bearish";

function normalize(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(n <= 1 ? n * 100 : n)));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function directionFromText(value: unknown): Direction | null {
  const v = text(value);
  if (!v || v === "unknown") return null;
  if (/bullish|bull|rising|rise|upward|up|positive|higher/.test(v)) return "bullish";
  if (/bearish|bear|falling|fall|downward|down|negative|lower/.test(v)) return "bearish";
  return null;
}

function pushEvidence(target: { bull: number; bear: number }, direction: Direction | null, confidence: number, weight: number) {
  if (!direction || confidence <= 0) return;
  const contribution = (confidence * weight) / 100;
  if (direction === "bullish") target.bull += contribution;
  else target.bear += contribution;
}

function indicatorDirection(indicator: any, kind: "rsi" | "macd" | "bb"): Direction | null {
  if (!indicator || typeof indicator !== "object") return null;

  const direct = directionFromText(indicator.direction) || directionFromText(indicator.state);
  if (direct) return direct;

  if (kind === "rsi") {
    const cross = text(indicator.cross50);
    if (/up|bull/.test(cross)) return "bullish";
    if (/down|bear/.test(cross)) return "bearish";
    const zone = text(indicator.zone);
    if (/above|over|bull/.test(zone)) return "bullish";
    if (/below|under|bear/.test(zone)) return "bearish";
  }

  if (kind === "macd") {
    const cross = text(indicator.cross) || text(indicator.lineRelationship);
    if (/bull|up/.test(cross)) return "bullish";
    if (/bear|down/.test(cross)) return "bearish";
    const histogram = text(indicator.histogramDirection);
    if (/increas|positive|up/.test(histogram)) return "bullish";
    if (/decreas|negative|down/.test(histogram)) return "bearish";
  }

  if (kind === "bb") {
    const cross = text(indicator.crossDirection) || text(indicator.middleCross);
    if (/up|bull/.test(cross)) return "bullish";
    if (/down|bear/.test(cross)) return "bearish";
  }

  return null;
}

function average(values: number[]): number {
  const usable = values.filter((value) => value > 0);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

/**
 * Calculates mobile signal confidence from independent extracted evidence.
 * Stage-2 model confidence is intentionally ignored so a provider returning a
 * fixed/template value (for example 60) cannot make every result look identical.
 */
export function calculateMobileSignalConfidence(input: {
  result: any;
  extraction: any;
  extractionConfidence?: number;
  requestedIndicators?: string[];
}): number {
  const { result, extraction } = input;
  const indicators = extraction?.indicators && typeof extraction.indicators === "object" ? extraction.indicators : {};
  const evidence = { bull: 0, bear: 0 };
  const evidenceConfidence: number[] = [];

  const extractionQuality = normalize(input.extractionConfidence ?? extraction?.extractionConfidence);
  const visualQuality = normalize(extraction?.visualQuality?.overallConfidence);
  if (extractionQuality) evidenceConfidence.push(extractionQuality);
  if (visualQuality) evidenceConfidence.push(visualQuality);

  const trendConfidence = normalize(extraction?.trend?.confidence);
  const momentumConfidence = normalize(extraction?.momentum?.confidence);
  const structureConfidence = normalize(extraction?.marketStructure?.confidence);
  pushEvidence(evidence, directionFromText(extraction?.trend?.state), trendConfidence, 1.35);
  pushEvidence(evidence, directionFromText(extraction?.momentum?.state), momentumConfidence, 1.15);
  pushEvidence(evidence, directionFromText(extraction?.marketStructure?.state), structureConfidence, 1.25);
  evidenceConfidence.push(...[trendConfidence, momentumConfidence, structureConfidence].filter((v) => v > 0));

  const candle = extraction?.candles || {};
  const candleConfidence = normalize(candle.confidence);
  pushEvidence(evidence, directionFromText(candle.recentDirection || candle.priceAction), candleConfidence, 1.05);
  evidenceConfidence.push(candleConfidence);

  const rsi = indicators.RSI;
  const macd = indicators.MACD;
  const bb = indicators["Bollinger Bands"] || indicators.BollingerBands;
  for (const [indicator, kind, weight] of [
    [rsi, "rsi", 1.0],
    [macd, "macd", 1.1],
    [bb, "bb", 0.9],
  ] as const) {
    if (!indicator || indicator.visible !== true) continue;
    const confidence = normalize(indicator.confidence);
    pushEvidence(evidence, indicatorDirection(indicator, kind), confidence, weight);
    if (confidence) evidenceConfidence.push(confidence);
  }

  const requested = Array.isArray(input.requestedIndicators) ? input.requestedIndicators : [];
  const requestedScores = requested.map((name) => normalize(indicators[name]?.confidence)).filter((v) => v > 0);
  if (requestedScores.length) evidenceConfidence.push(average(requestedScores));

  const totalDirectional = evidence.bull + evidence.bear;
  const strongest = Math.max(evidence.bull, evidence.bear);
  const weakest = Math.min(evidence.bull, evidence.bear);
  const directionalAgreement = totalDirectional > 0 ? (strongest / totalDirectional) * 100 : 0;
  const conflictRatio = totalDirectional > 0 ? (weakest / totalDirectional) * 100 : 100;
  const quality = average(evidenceConfidence);

  const signal = text(result?.signal);
  const trend = directionFromText(result?.trend);
  const target = signal.includes("buy") ? "bullish" : signal.includes("sell") ? "bearish" : trend;
  const targetEvidence = target === "bullish" ? evidence.bull : target === "bearish" ? evidence.bear : strongest;
  const opposingEvidence = target === "bullish" ? evidence.bear : target === "bearish" ? evidence.bull : weakest;

  let confidence: number;

  if (signal === "unsure") {
    confidence = quality * 0.65;
  } else if (signal === "wait" || signal === "no_trade") {
    // WAIT/NO_TRADE confidence means confidence that staying out is the correct
    // decision, not confidence that price will move in one direction.
    const clearConflict = totalDirectional > 0 && opposingEvidence > 0;
    const missingConfirmation = targetEvidence > 0 && targetEvidence < 2.4 * Math.max(opposingEvidence, 1);
    const decisionClarity = clearConflict ? Math.min(100, 55 + conflictRatio * 0.55) : missingConfirmation ? 68 : 48;
    confidence = quality * 0.55 + decisionClarity * 0.45;
  } else {
    const confluence = targetEvidence > 0 ? Math.min(100, (targetEvidence / Math.max(targetEvidence + opposingEvidence, 1)) * 100) : 0;
    confidence = quality * 0.45 + directionalAgreement * 0.55;
    confidence = confidence * 0.65 + confluence * 0.35;
  }

  // Do not report high confidence when the screenshot itself is poorly extracted.
  const extractionCap = extractionQuality > 0 ? Math.min(100, extractionQuality + 8) : 65;
  confidence = Math.min(confidence, extractionCap);

  // Keep usable analysis visibly distinct from the old fixed 60% response.
  if (quality > 0 && Math.round(confidence) === 60) {
    confidence += signal === "wait" || signal === "no_trade" ? (conflictRatio >= 35 ? 4 : -3) : (directionalAgreement >= 70 ? 5 : -4);
  }

  return Math.max(1, Math.min(100, Math.round(confidence)));
}
