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

/**
 * Estimate extraction quality from the actual evidence instead of trusting a
 * provider's repeated template confidence (for example 60%). Exact readable
 * price/indicator values and clearly visible panels therefore improve the
 * quality ceiling for the final signal.
 */
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
 *
 * Confidence is evidence/analysis quality, not probability of winning a trade.
 * It is deliberately calculated from the extracted values and confluence so
 * BUY, SELL and WAIT can receive different scores instead of converging on a
 * provider's default number.
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

  // Deterministically derive Entry / SL / TP from extracted chart structure.
  // This runs after the server-side signal gate, so WAIT never receives a
  // fabricated trade setup. The helper also enforces valid price geometry and
  // a minimum 1.5R reward/risk ratio.
  const tradeLevels = calculateMobileTradeLevels(input.extraction, rules.signal);
  if (tradeLevels.entryPrice !== null) input.result.entryPrice = tradeLevels.entryPrice;
  if (tradeLevels.stopLoss !== null) input.result.stopLoss = tradeLevels.stopLoss;
  if (tradeLevels.takeProfit !== null) input.result.takeProfit = tradeLevels.takeProfit;
  if (tradeLevels.riskReward !== null) input.result.riskReward = tradeLevels.riskReward;
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

  // Evidence quality is the ceiling, but the ceiling now reflects the actual
  // readable price/indicator/candle evidence rather than a repeated template
  // confidence from the vision provider.
  const extractionCap = Math.min(100, quality + 5);
  score = Math.min(score, extractionCap);

  if (rules.evidenceCount < 3 || rules.availableWeight < 45) score = Math.min(score, 55);

  return Math.max(1, Math.min(100, Math.round(score)));
}

export { calculateMobileSignalRules };
