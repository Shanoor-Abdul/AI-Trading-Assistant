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
  marketRegime: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "BREAKOUT" | "UNCLEAR" | "RECOVERY" | "PULLBACK" | "CHOPPY";
  selectedStrategy: string;
  riskReward: number | null;
}

function text(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return "";
}

function direction(str: string): "bull" | "bear" | "neutral" {
  const s = str.toLowerCase();
  if (s.includes("bull") || s.includes("up") || s.includes("buy") || s.includes("long") || s.includes("recovery")) return "bull";
  if (s.includes("bear") || s.includes("down") || s.includes("sell") || s.includes("short")) return "bear";
  return "neutral";
}

function numeric(value: any): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function collectBatches(progressive: any): any[] {
  if (!progressive) return [];
  if (Array.isArray(progressive)) return progressive;
  if (typeof progressive === "object" && progressive.progressiveState) {
    return Array.isArray(progressive.progressiveState) ? progressive.progressiveState : [];
  }
  return [];
}

function numberFromObject(obj: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = numeric(obj?.[key]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * V3 Hierarchical Reasoning Engine
 * Applies Temporal Weighting and Transition State logic.
 */
export function generateFastSignal(input: FastSignalInput): FastSignalResult {
  const started = Date.now();
  const market = input.market || {};
  const batches = collectBatches(input.progressive);
  const previous = batches[batches.length - 1] || {};
  const unified = (market.unifiedMarketData || previous.unifiedMarketData || {}) as any;

  let bullPrimaryScore = 0;
  let bearPrimaryScore = 0;
  let bullShortTermScore = 0;
  let bearShortTermScore = 0;
  let structureVote = "neutral";
  let momentumVote = "neutral";
  let indicatorVote = "neutral";

  // Temporal Weighting
  batches.forEach((batch, index) => {
    // Is this a partial batch or the absolute latest?
    const isLatest = index === batches.length - 1;
    const isPartial = batch.status === "PARTIAL" || batch.source === "partial_progressive";
    
    let weight = 0.2; // default for old batches
    if (isPartial) {
      weight = 1.0;
    } else if (isLatest) {
      weight = 0.8;
    } else if (index === batches.length - 2) {
      weight = 0.5;
    }

    const dTrend = direction(text(batch.primaryTrend || batch.trend));
    if (dTrend === "bull") bullPrimaryScore += weight;
    if (dTrend === "bear") bearPrimaryScore += weight;

    const dShort = direction(text(batch.shortTermDirection || batch.momentum || batch.candlestickBehavior));
    if (dShort === "bull") bullShortTermScore += weight;
    if (dShort === "bear") bearShortTermScore += weight;

    if (isLatest || isPartial) {
      structureVote = direction(text(batch.structureTransition || batch.marketStructure || batch.marketState));
      momentumVote = direction(text(batch.momentum));
      const indStr = Object.values(batch.indicatorState || {}).map(text).join(" ");
      indicatorVote = direction(indStr);
    }
  });

  const primaryTrend = bullPrimaryScore > bearPrimaryScore + 0.5 ? "bull" 
                     : bearPrimaryScore > bullPrimaryScore + 0.5 ? "bear" : "neutral";

  const shortTermDirection = bullShortTermScore > bearShortTermScore + 0.3 ? "bull"
                           : bearShortTermScore > bullShortTermScore + 0.3 ? "bear" : "neutral";

  // State Transition Machine
  let structureTransition = "UNCLEAR";
  if (primaryTrend === "bear" && shortTermDirection === "bull") structureTransition = "RECOVERY";
  else if (primaryTrend === "bull" && shortTermDirection === "bear") structureTransition = "PULLBACK";
  else if (primaryTrend === "bear" && shortTermDirection === "bear") structureTransition = "CONTINUATION";
  else if (primaryTrend === "bull" && shortTermDirection === "bull") structureTransition = "CONTINUATION";
  else if (primaryTrend === "neutral" && shortTermDirection !== "neutral") structureTransition = "BREAKOUT";
  else if (primaryTrend === "neutral" && shortTermDirection === "neutral") structureTransition = "CHOPPY";
  
  if (structureVote !== "neutral" && structureVote !== "unclear") {
     const extracted = text(previous.structureTransition).toUpperCase();
     if (["CONTINUATION", "PULLBACK", "RECOVERY", "REVERSAL_DEVELOPING", "REVERSAL_CONFIRMED", "BREAKOUT", "FALSE_BREAKOUT", "RANGE", "CHOPPY"].includes(extracted)) {
         structureTransition = extracted;
     }
  }

  const bullishEvidence: string[] = [];
  const bearishEvidence: string[] = [];

  if (primaryTrend === "bull") bullishEvidence.push("Primary trend is heavily bullish.");
  if (primaryTrend === "bear") bearishEvidence.push("Primary trend is heavily bearish.");
  if (shortTermDirection === "bull") bullishEvidence.push("Short-term price action and momentum is bullish.");
  if (shortTermDirection === "bear") bearishEvidence.push("Short-term price action and momentum is bearish.");
  if (structureTransition === "RECOVERY") bullishEvidence.push("Market is showing a bullish recovery against a bearish primary trend.");
  if (structureTransition === "PULLBACK") bearishEvidence.push("Market is showing a bearish pullback against a bullish primary trend.");

  if (momentumVote === "bull") bullishEvidence.push("Momentum indicators support upside.");
  if (momentumVote === "bear") bearishEvidence.push("Momentum indicators support downside.");
  if (indicatorVote === "bull") bullishEvidence.push("Technical indicators confirm bullish direction.");
  if (indicatorVote === "bear") bearishEvidence.push("Technical indicators confirm bearish direction.");

  const price = numberFromObject(unified, ["currentPrice", "price", "close"])
    ?? numberFromObject(market, ["currentPrice", "price", "close"]);
  const supports = asArray(unified.supportLevels?.value || market.supportLevels?.value || market.supportLevels).map(Number).filter(Number.isFinite);
  const resistances = asArray(unified.resistanceLevels?.value || market.resistanceLevels?.value || market.resistanceLevels).map(Number).filter(Number.isFinite);
  const supportBelow = price !== null && supports.some((level) => level < price);
  const resistanceAbove = price !== null && resistances.some((level) => level > price);
  if (supportBelow) bullishEvidence.push("Price is holding above a visible support level.");
  if (resistanceAbove) bearishEvidence.push("Price is below a visible resistance level.");

  const isBull = shortTermDirection === "bull" || structureTransition === "RECOVERY" || structureTransition === "REVERSAL_CONFIRMED";
  const isBear = shortTermDirection === "bear" || structureTransition === "PULLBACK" || structureTransition === "REVERSAL_CONFIRMED";

  let signal: Signal = "WAIT";
  
  // Independent Evidence Gate
  const structureConfirm = structureTransition === "CONTINUATION" || structureTransition === "REVERSAL_CONFIRMED" || structureTransition === "BREAKOUT";
  const momentumConfirm = isBull ? momentumVote === "bull" : isBear ? momentumVote === "bear" : false;
  const indicatorConfirm = isBull ? indicatorVote === "bull" : isBear ? indicatorVote === "bear" : false;

  const independentGates = [structureConfirm, momentumConfirm, indicatorConfirm].filter(Boolean).length;

  if (structureTransition === "RECOVERY" || structureTransition === "PULLBACK" || structureTransition === "REVERSAL_DEVELOPING") {
      signal = "WAIT"; // Needs confirmation
  } else if (structureTransition === "CHOPPY" || structureTransition === "RANGE" || structureTransition === "FALSE_BREAKOUT" || structureTransition === "UNCLEAR") {
      signal = "WAIT"; // No edge
  } else if (independentGates >= 2) {
      if (isBull && bullShortTermScore > bearShortTermScore) signal = "BUY";
      if (isBear && bearShortTermScore > bullShortTermScore) signal = "SELL";
  }

  let trend: Trend = "Sideways";
  if (primaryTrend === "bull") trend = "Bullish";
  else if (primaryTrend === "bear") trend = "Bearish";

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
    Math.max(bullShortTermScore, bearShortTermScore) * 15
    + independentGates * 10
    + (riskReward !== null && riskReward >= 1.5 ? 10 : 0)
  ));

  const confidence = signal === "WAIT" 
      ? Math.min(65, 40 + independentGates * 5)
      : Math.min(95, 65 + independentGates * 10);

  const quality = signal === "WAIT"
    ? (confidence >= 55 ? "FAIR" : "POOR")
    : confidence >= 80 && independentGates >= 2 ? "GOOD" : "FAIR";
  const readiness = signal === "WAIT" ? "NOT READY" : confidence >= 80 && independentGates >= 2 ? "READY" : "GOOD";

  const invalidationConditions = signal === "BUY"
    ? ["Short-term bullish direction fails.", "Price breaks below support."]
    : signal === "SELL"
      ? ["Short-term bearish direction fails.", "Price reclaims resistance."]
      : ["Wait for transition state to confirm before entry.", "Avoid trades during developing reversals or choppiness."];

  const batchLabel = batches.length ? `${batches.length} progressive batch${batches.length > 1 ? "es" : ""}` : "latest progressive state";
  
  let explanation = "";
  if (signal === "WAIT") {
      explanation = `Fast gate evaluated ${batchLabel}. Market is in a ${structureTransition.replace("_", " ")} state. Waiting for independent confirmation.`;
  } else {
      explanation = `Fast ${signal} signal from ${batchLabel}. Temporal structure shows ${structureTransition.replace("_", " ")} with momentum alignment.`;
  }

  return {
    trend,
    primaryTrend: primaryTrend === "bull" ? "Bullish" : primaryTrend === "bear" ? "Bearish" : "Sideways",
    shortTermDirection: shortTermDirection === "bull" ? "Bullish" : shortTermDirection === "bear" ? "Bearish" : "Sideways",
    structureTransition,
    signal,
    confidence,
    dataConfidence: 85,
    signalQuality: quality,
    readiness,
    marketState: text(market.marketRegime || previous.marketState || unified.marketStructure) || structureTransition,
    momentum: momentumVote === "bull" ? "Bullish" : momentumVote === "bear" ? "Bearish" : "Neutral",
    strategyConsensus: signal === "BUY" ? "Bullish" : signal === "SELL" ? "Bearish" : "Mixed",
    bullishEvidence,
    bearishEvidence,
    invalidationConditions,
    explanation,
    latencyMode: "LOCAL_TEXT",
    generatedAt: started,
    evidenceScore,
    marketRegime: ["CONTINUATION", "RECOVERY"].includes(structureTransition) ? "TRENDING_UP" : ["CONTINUATION", "PULLBACK"].includes(structureTransition) ? "TRENDING_DOWN" : "RANGING",
    selectedStrategy: "Temporal Validation Engine",
    riskReward,
  };
}
