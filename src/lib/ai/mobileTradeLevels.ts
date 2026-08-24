type TradeSide = "BUY" | "SELL";

type Level = { value?: unknown; price?: unknown; confidence?: unknown; strength?: unknown; type?: unknown };

type TradeLevels = {
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  source: string;
  confidence: number;
  reason: string;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function levels(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: Level | number) => num(typeof item === "number" ? item : item?.value ?? item?.price))
    .filter((value): value is number => value !== null);
}

function nearestAbove(values: number[], entry: number): number | null {
  const candidates = values.filter((value) => value > entry);
  return candidates.length ? Math.min(...candidates) : null;
}

function nearestBelow(values: number[], entry: number): number | null {
  const candidates = values.filter((value) => value < entry);
  return candidates.length ? Math.max(...candidates) : null;
}

function confidenceFromLevels(extraction: any, source: string): number {
  const supportConfidence = num(extraction?.supportLevels?.[0]?.confidence) ?? 0;
  const resistanceConfidence = num(extraction?.resistanceLevels?.[0]?.confidence) ?? 0;
  const candleConfidence = num(extraction?.candles?.confidence) ?? 0;
  if (source.includes("support/resistance")) return Math.round(Math.max(55, Math.min(95, (supportConfidence + resistanceConfidence) / 2 || 60)));
  if (source.includes("swing")) return Math.round(Math.max(45, Math.min(85, candleConfidence || 55)));
  return 45;
}

/**
 * Derives executable price levels only from values actually extracted from the
 * chart. It never invents a numeric level. Entry is the extracted current price;
 * SL is placed beyond the nearest opposing structure and TP at the nearest
 * target structure. A minimum 1.5R reward/risk is required before returning TP.
 */
export function calculateMobileTradeLevels(extraction: any, signal: unknown): TradeLevels {
  const normalizedSignal = String(signal ?? "").toUpperCase();
  const side: TradeSide | null = normalizedSignal.includes("BUY") ? "BUY" : normalizedSignal.includes("SELL") ? "SELL" : null;
  const entry = num(extraction?.currentPrice?.value);

  if (!side || entry === null) {
    return { entryPrice: null, stopLoss: null, takeProfit: null, riskReward: null, source: "insufficient_signal_or_price", confidence: 0, reason: "A directional BUY/SELL signal and readable current price are required." };
  }

  const supports = levels(extraction?.supportLevels);
  const resistances = levels(extraction?.resistanceLevels);
  const swingHigh = num(extraction?.swingHigh);
  const swingLow = num(extraction?.swingLow);
  const bb = extraction?.indicators?.["Bollinger Bands"] || extraction?.indicators?.BollingerBands;
  const bbUpper = num(bb?.upper);
  const bbLower = num(bb?.lower);

  let stopLoss: number | null = null;
  let takeProfit: number | null = null;
  let source = "support/resistance";

  if (side === "BUY") {
    stopLoss = nearestBelow(supports, entry) ?? (swingLow !== null && swingLow < entry ? swingLow : null);
    takeProfit = nearestAbove(resistances, entry) ?? (swingHigh !== null && swingHigh > entry ? swingHigh : null);

    // Bollinger levels are a last-resort structural reference, not claimed as
    // support/resistance. They are only used when their geometry is valid.
    if (stopLoss === null && bbLower !== null && bbLower < entry) {
      stopLoss = bbLower;
      source = "Bollinger lower fallback";
    }
    if (takeProfit === null && bbUpper !== null && bbUpper > entry) {
      takeProfit = bbUpper;
      source = source === "support/resistance" ? "Bollinger upper fallback" : source;
    }
  } else {
    stopLoss = nearestAbove(resistances, entry) ?? (swingHigh !== null && swingHigh > entry ? swingHigh : null);
    takeProfit = nearestBelow(supports, entry) ?? (swingLow !== null && swingLow < entry ? swingLow : null);

    if (stopLoss === null && bbUpper !== null && bbUpper > entry) {
      stopLoss = bbUpper;
      source = "Bollinger upper fallback";
    }
    if (takeProfit === null && bbLower !== null && bbLower < entry) {
      takeProfit = bbLower;
      source = source === "support/resistance" ? "Bollinger lower fallback" : source;
    }
  }

  if (stopLoss === null || takeProfit === null) {
    return { entryPrice: entry, stopLoss, takeProfit, riskReward: null, source: "insufficient_price_structure", confidence: confidenceFromLevels(extraction, source), reason: "The chart does not contain enough reliable structure to calculate both stop loss and target without inventing levels." };
  }

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  if (risk <= 0 || reward <= 0) {
    return { entryPrice: entry, stopLoss: null, takeProfit: null, riskReward: null, source: "invalid_level_geometry", confidence: 0, reason: "Extracted levels do not form valid trade geometry." };
  }

  const riskReward = reward / risk;
  if (riskReward < 1.5) {
    return { entryPrice: entry, stopLoss, takeProfit: null, riskReward: Number(riskReward.toFixed(2)), source: "poor_risk_reward", confidence: confidenceFromLevels(extraction, source), reason: `Available target provides only ${riskReward.toFixed(2)}R; minimum required is 1.5R.` };
  }

  return {
    entryPrice: entry,
    stopLoss,
    takeProfit,
    riskReward: Number(riskReward.toFixed(2)),
    source,
    confidence: confidenceFromLevels(extraction, source),
    reason: `${side} levels derived from extracted chart structure with ${riskReward.toFixed(2)}R reward/risk.`,
  };
}
