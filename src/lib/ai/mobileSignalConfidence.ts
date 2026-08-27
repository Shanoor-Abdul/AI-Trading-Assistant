import { calculateMobileSignalRules } from "./mobileSignalRules";
import { calculateMobileTradeLevels } from "./mobileTradeLevels";

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

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function evidenceQuality(extraction: any, requestedIndicators: string[] = []): number {
  const scores: number[] = [];
  const price = extraction?.currentPrice;
  if (numeric(price?.value) !== null) scores.push(Math.max(70, normalize(price?.confidence)));

  const indicators = extraction?.indicators && typeof extraction.indicators === "object" ? extraction.indicators : {};
  const names = requestedIndicators.length ? requestedIndicators : Object.keys(indicators);

  for (const name of names) {
    const indicator = indicators[name];
    if (!indicator || typeof indicator !== "object") continue;
    const c = normalize(indicator.confidence);
    const hasNumeric = [indicator.value, indicator.upper, indicator.middle, indicator.lower, indicator.macd, indicator.signal, indicator.histogram, indicator.rsi1, indicator.rsi2, indicator.rsi3]
      .some((value) => numeric(value) !== null);
    if (indicator.visible === true || c > 0 || hasNumeric) scores.push(Math.max(c, hasNumeric ? 80 : 55));
  }

  const candleConfidence = normalize(extraction?.candles?.confidence);
  if (extraction?.candles?.latest || candleConfidence > 0) scores.push(Math.max(candleConfidence, 55));

  const visualQuality = normalize(extraction?.visualQuality?.overallConfidence);
  if (visualQuality > 0) scores.push(visualQuality);

  const visualEvidence = Array.isArray(extraction?.visualEvidence) ? extraction.visualEvidence.length : 0;
  if (visualEvidence >= 3) scores.push(Math.min(95, 60 + visualEvidence * 4));

  if (!scores.length) return normalize(extraction?.extractionConfidence) || 50;

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const explicit = normalize(extraction?.extractionConfidence);
  return Math.round(Math.max(average, explicit > 0 ? Math.min(explicit + 15, 100) : 0));
}

/**
 * Server-side confidence for mobile analysis.
 * Confidence is evidence/analysis quality, not probability of winning a trade.
 */
export function calculateMobileSignalConfidence(input: {
  result: any;
  extraction: any;
  extractionConfidence?: number;
  requestedIndicators?: string[];
}): number {
  const requestedIndicators = input.requestedIndicators || [];
  const rules = calculateMobileSignalRules(input.extraction);
  const quality = evidenceQuality(input.extraction, requestedIndicators);

  const signal = text(input.result?.signal);
  const modelTrend = directionFromText(input.result?.trend);
  const rulesTrend = directionFromText(rules.trend);

  // Derive trade levels from extracted chart structure only after the server
  // signal gate. WAIT never receives a fabricated setup. The helper requires
  // valid price geometry and at least 1.5R reward/risk.
  const tradeLevels = calculateMobileTradeLevels(input.extraction, rules.signal);
  input.result.entryPrice = tradeLevels.entryPrice;
  input.result.stopLoss = tradeLevels.stopLoss;
  input.result.takeProfit = tradeLevels.takeProfit;
  input.result.riskReward = tradeLevels.riskReward;
  input.result.tradeLevelSource = tradeLevels.source;
  input.result.tradeLevelConfidence = tradeLevels.confidence;
  if (tradeLevels.reason) {
    const existing = typeof input.result.explanation === "string" ? input.result.explanation.trim() : "";
    input.result.explanation = existing ? `${existing} ${tradeLevels.reason}` : tradeLevels.reason;
  }

  let score = rules.confidence;

  if (signal.includes("buy") && rules.signal.includes("BUY")) score += 8;
  else if (signal.includes("sell") && rules.signal.includes("SELL")) score += 8;
  else if ((signal === "buy" && rules.signal.includes("SELL")) || (signal === "sell" && rules.signal.includes("BUY"))) score -= 18;
  else if (signal === "wait" || signal === "no_trade") score = Math.max(score, rules.signal === "WAIT" ? rules.confidence : 45);

  if (modelTrend && rulesTrend && modelTrend !== rulesTrend) score -= 10;

  const extractionCap = Math.min(100, quality + 5);
  score = Math.min(score, extractionCap);

  if (rules.evidenceCount < 2 || rules.availableWeight < 30) score = Math.min(score, 55); // Relaxed for Binary Options

  return Math.max(1, Math.min(100, Math.round(score)));
}

export { calculateMobileSignalRules };
