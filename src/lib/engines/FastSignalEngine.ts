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
}

function numeric(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "value" in value) {
    const v = Number(value.value);
    return Number.isFinite(v) ? v : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractDirection(textValue: string | null | undefined): "bull" | "bear" | "neutral" {
  if (!textValue) return "neutral";
  const t = String(textValue).toLowerCase();
  if (/(bull|upward|higher|buy|long)/.test(t)) return "bull";
  if (/(bear|downward|lower|sell|short|reject)/.test(t)) return "bear";
  return "neutral";
}

export function generateFastSignal(input: FastSignalInput): FastSignalResult {
  const started = Date.now();
  
  // Flatten batches
  const batches = Array.isArray(input.progressive) ? input.progressive : [];
  const latestBatch = batches[batches.length - 1] || {};
  
  // Extract Data from Unified Market Snapshot
  const unified = latestBatch?.unifiedMarketData || {};
  const evidenceGroups = unified.evidenceGroups || {};
  const temporal = unified.temporalState || {};
  
  const currentPrice = numeric(unified.currentPrice);
  const supportLevels = Array.isArray(unified.supportLevels?.value) ? unified.supportLevels.value.map(numeric).filter((n: any): n is number => n !== null) : [];
  const resistanceLevels = Array.isArray(unified.resistanceLevels?.value) ? unified.resistanceLevels.value.map(numeric).filter((n: any): n is number => n !== null) : [];
  
  // Basic directions
  const structureDir = extractDirection(unified.marketStructure?.value);
  const momentumDir = extractDirection(unified.momentum?.value);
  const trendDir = extractDirection(unified.trend?.value);
  
  // Phase 3: HARD GATE CONDITIONS
  // 1. Evidence (Must have at least 3 confirming independent groups)
  let bullishGroups = 0;
  let bearishGroups = 0;
  
  const allGroups = [
    evidenceGroups.structure,
    evidenceGroups.candle,
    evidenceGroups.momentum,
    evidenceGroups.indicators,
    evidenceGroups.supportResistance,
    evidenceGroups.mtf
  ];
  
  allGroups.forEach(group => {
    if (Array.isArray(group)) {
      const text = group.join(" ").toLowerCase();
      const dir = extractDirection(text);
      if (dir === "bull") bullishGroups++;
      if (dir === "bear") bearishGroups++;
    }
  });

  // 2. MTF + Structure + Momentum
  const isBullishAlignment = trendDir === "bull" || (structureDir === "bull" && momentumDir === "bull");
  const isBearishAlignment = trendDir === "bear" || (structureDir === "bear" && momentumDir === "bear");
  
  // 3. Contradiction Check
  const hasContradiction = unified.dataConflict === true || (bullishGroups > 1 && bearishGroups > 1) || temporal.conflicts?.length > 0;
  
  // 4. Trigger (Confirmation Status)
  const isConfirmed = temporal.confirmationStatus === "CONFIRMED" || temporal.transition === "REVERSAL_CONFIRMED" || temporal.transition === "CONTINUATION";
  const isDeveloping = temporal.confirmationStatus === "DEVELOPING" || temporal.transition === "REVERSAL_DEVELOPING" || temporal.transition === "PULLBACK";

  // 5. Risk / Reward (Missing-Data Safety)
  // Find nearest S/R
  const support = supportLevels.length ? Math.max(...supportLevels.filter((l: any) => currentPrice === null || l < currentPrice)) : null;
  const resistance = resistanceLevels.length ? Math.min(...resistanceLevels.filter((l: any) => currentPrice === null || l > currentPrice)) : null;
  
  const hasRiskData = currentPrice !== null && support !== null && resistance !== null;
  
  let riskReward: number | null = null;
  let riskDecision: "APPROVED" | "REJECTED" | "WAIT" = "WAIT";
  
  // Candidate Signals
  let candidateSignal: Signal = "WAIT";
  if (bullishGroups >= 3 && isBullishAlignment && !hasContradiction) {
    candidateSignal = "BUY";
  } else if (bearishGroups >= 3 && isBearishAlignment && !hasContradiction) {
    candidateSignal = "SELL";
  }
  
  // Calculate R:R for Candidate
  if (hasRiskData) {
    if (candidateSignal === "BUY") {
      const risk = currentPrice! - support!;
      const reward = resistance! - currentPrice!;
      riskReward = risk > 0 ? reward / risk : null;
    } else if (candidateSignal === "SELL") {
      const risk = resistance! - currentPrice!;
      const reward = currentPrice! - support!;
      riskReward = risk > 0 ? reward / risk : null;
    }
  }

  // Risk Gate
  if (candidateSignal !== "WAIT") {
    if (!hasRiskData) {
      riskDecision = "WAIT"; // Missing data safety
    } else if (riskReward !== null && riskReward >= 1.2) { // Minimum 1.2 R:R Hard Gate
      riskDecision = "APPROVED";
    } else {
      riskDecision = "REJECTED"; // Poor risk/reward
    }
  }

  // FINAL HARD GATE EXECUTION
  let finalSignal: Signal = "WAIT";
  if (candidateSignal !== "WAIT" && riskDecision === "APPROVED" && isConfirmed) {
    finalSignal = candidateSignal;
  }
  
  // Deterministic Score
  const evidenceScore = Math.min(100, (Math.max(bullishGroups, bearishGroups) * 15) + (isConfirmed ? 20 : isDeveloping ? 10 : 0) + (!hasContradiction ? 10 : 0));
  const confidence = finalSignal !== "WAIT" ? Math.max(75, evidenceScore) : Math.min(65, evidenceScore);
  const dataConfidence = unified.currentPrice?.confidence || latestBatch.confidence || 0;
  
  // Map outputs
  const explanation = finalSignal === "WAIT" 
    ? (riskDecision === "WAIT" ? "WAIT: Missing precise risk data (entry, invalidation, or target)." : riskDecision === "REJECTED" ? "WAIT: Setup rejected by Risk Gate due to poor R:R or immediate opposing structure." : hasContradiction ? "WAIT: Conflicting evidence detected." : !isConfirmed ? "WAIT: Setup is developing but not confirmed." : "WAIT: Insufficient confluence.")
    : `${finalSignal} APPROVED: Confluence met (${Math.max(bullishGroups, bearishGroups)} groups), structure aligned, Risk Gate passed (R:R ${riskReward?.toFixed(2)}).`;

  const transition = temporal.transition || "NONE";
  const marketRegime = temporal.regime || "UNCLEAR";
  
  return {
    trend: bullishGroups > bearishGroups ? "Bullish" : bearishGroups > bullishGroups ? "Bearish" : "Sideways",
    signal: finalSignal,
    confidence,
    dataConfidence,
    signalQuality: finalSignal !== "WAIT" ? (riskReward !== null && riskReward > 2 ? "GOOD" : "FAIR") : "AVOID",
    readiness: finalSignal !== "WAIT" ? "READY" : "NOT READY",
    marketState: `${marketRegime} (${transition})`,
    momentum: momentumDir === "bull" ? "Bullish" : momentumDir === "bear" ? "Bearish" : "Neutral",
    strategyConsensus: finalSignal !== "WAIT" ? "Aligned" : "Mixed",
    bullishEvidence: [
      bullishGroups >= 3 ? "Strong structural and momentum confluence" : "Insufficient bullish alignment",
      isConfirmed && candidateSignal === "BUY" ? "Setup confirmed" : "Unconfirmed setup"
    ],
    bearishEvidence: [
      bearishGroups >= 3 ? "Strong structural and momentum confluence" : "Insufficient bearish alignment",
      isConfirmed && candidateSignal === "SELL" ? "Setup confirmed" : "Unconfirmed setup"
    ],
    invalidationConditions: candidateSignal === "BUY" && hasRiskData ? [`Close below support at ${support}`] : candidateSignal === "SELL" && hasRiskData ? [`Close above resistance at ${resistance}`] : ["Missing exact invalidation data"],
    explanation,
    latencyMode: "LOCAL_TEXT",
    generatedAt: started,
    evidenceScore,
    marketRegime: marketRegime as FastSignalResult["marketRegime"],
    selectedStrategy: "Deterministic Hard Gate Engine",
    riskReward,
    transition,
    currentFrameCount: batches.length
  };
}
