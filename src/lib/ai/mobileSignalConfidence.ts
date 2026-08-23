import { calculateMobileSignalRules } from "./mobileSignalRules";

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

/**
 * Server-side confidence for mobile analysis.
 *
 * The old implementation could converge around the provider's template value
 * (for example 60%). This version is driven by the extracted evidence and the
 * weighted confluence engine, so BUY/SELL/WAIT can legitimately receive
 * different confidence values.
 *
 * Confidence is evidence/analysis quality, not probability of winning a trade.
 */
export function calculateMobileSignalConfidence(input: {
  result: any;
  extraction: any;
  extractionConfidence?: number;
  requestedIndicators?: string[];
}): number {
  const rules = calculateMobileSignalRules(input.extraction);
  const extractionQuality = normalize(input.extractionConfidence ?? input.extraction?.extractionConfidence);
  const visualQuality = normalize(input.extraction?.visualQuality?.overallConfidence);
  const quality = extractionQuality || visualQuality || 50;

  const signal = text(input.result?.signal);
  const modelTrend = directionFromText(input.result?.trend);
  const rulesTrend = directionFromText(rules.trend);

  // Prefer the deterministic confluence result when it is decisive. For WAIT,
  // confidence describes how strongly the evidence supports staying out.
  let score = rules.confidence;

  if (signal.includes("buy") && rules.signal.includes("BUY")) score += 8;
  else if (signal.includes("sell") && rules.signal.includes("SELL")) score += 8;
  else if ((signal === "buy" && rules.signal.includes("SELL")) || (signal === "sell" && rules.signal.includes("BUY"))) score -= 18;
  else if (signal === "wait" || signal === "no_trade") score = Math.max(score, rules.signal === "WAIT" ? rules.confidence : 45);

  if (modelTrend && rulesTrend && modelTrend !== rulesTrend) score -= 10;

  // Extraction quality is a hard ceiling. A blurry chart must not produce a
  // high-confidence signal just because the model wrote a confident explanation.
  const extractionCap = extractionQuality > 0 ? Math.min(100, extractionQuality + 8) : Math.min(75, quality + 8);
  score = Math.min(score, extractionCap);

  // Missing evidence should reduce confidence rather than being treated as a
  // neutral vote. This also prevents a fully populated-looking JSON template
  // from receiving a high score when only one indicator was actually readable.
  if (rules.evidenceCount < 3 || rules.availableWeight < 45) score = Math.min(score, 55);

  return Math.max(1, Math.min(100, Math.round(score)));
}

export { calculateMobileSignalRules };
