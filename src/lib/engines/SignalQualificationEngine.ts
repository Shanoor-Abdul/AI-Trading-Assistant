import type { TradingAnalysis } from "@/lib/types";

export type SignalQualification = {
  approved: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
  grade: "A+" | "A" | "B" | "C" | "NO_TRADE";
};

const directionalSignals = new Set(["BUY", "SELL", "STRONG_BUY", "STRONG_SELL"]);

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function evidenceCount(values: unknown): number {
  return Array.isArray(values) ? values.filter(Boolean).length : 0;
}

/**
 * Deterministic gate placed after AI reasoning and before risk/execution.
 * It does not predict the market. It prevents weak or contradictory AI
 * conclusions from becoming actionable signals.
 */
export function qualifySignal(result: TradingAnalysis): SignalQualification {
  const signal = normalize(result.signal);
  const quality = normalize(result.signalQuality);
  const confirmation = normalize(result.confirmationStatus);
  const trend = normalize(result.trend);
  const strategy = normalize(result.strategyConsensus);
  const confidence = Number(result.confidence) || 0;
  const evidenceScore = Number((result as any).evidenceScore) || 0;
  const dataConfidence = Number(result.dataConfidence) || 0;

  const reasons: string[] = [];
  const blockers: string[] = [];
  let score = 0;

  if (!directionalSignals.has(signal)) {
    return {
      approved: true,
      score: Math.min(100, Math.max(0, confidence)),
      reasons: ["Non-directional result; no trade gate required."],
      blockers: [],
      grade: "NO_TRADE",
    };
  }

  if (confidence >= 75) score += 20;
  else if (confidence >= 65) score += 12;
  else blockers.push("AI confidence is below the strong-signal threshold.");

  if (evidenceScore >= 75) score += 20;
  else if (evidenceScore >= 60) score += 10;
  else blockers.push("Evidence score is too low for an actionable signal.");

  if (dataConfidence >= 80) score += 15;
  else if (dataConfidence >= 65) score += 8;
  else blockers.push("Market-data confidence is too low.");

  if (["confirmed", "developing"].includes(confirmation)) score += 15;
  else blockers.push("Setup is not confirmed.");

  if (["excellent", "good"].includes(quality)) score += 10;
  else blockers.push("Signal quality is not strong enough.");

  const bullish = evidenceCount((result as any).bullishEvidence);
  const bearish = evidenceCount((result as any).bearishEvidence);
  const opposing = signal === "buy" || signal === "strong_buy" ? bearish : bullish;
  const supporting = signal === "buy" || signal === "strong_buy" ? bullish : bearish;

  if (supporting >= 3) score += 10;
  else if (supporting >= 2) score += 5;
  else blockers.push("There are not enough independent directional evidence items.");

  if (opposing === 0) score += 5;
  else if (opposing >= 2) blockers.push("Multiple opposing evidence items conflict with the signal.");

  const conflicts = evidenceCount(result.strategyConflicts);
  if (conflicts === 0) score += 5;
  else if (conflicts >= 2) blockers.push("Strategy conflicts materially weaken the setup.");

  if (strategy === "bullish" && (signal === "buy" || signal === "strong_buy")) {
    reasons.push("Strategy consensus agrees with BUY direction.");
  } else if (strategy === "bearish" && (signal === "sell" || signal === "strong_sell")) {
    reasons.push("Strategy consensus agrees with SELL direction.");
  } else if (strategy && strategy !== "neutral" && strategy !== "mixed") {
    blockers.push("Strategy consensus does not clearly agree with the signal.");
  }

  if (trend === "bullish" && (signal === "buy" || signal === "strong_buy")) score += 5;
  if (trend === "bearish" && (signal === "sell" || signal === "strong_sell")) score += 5;
  if (trend === "sideways") blockers.push("Sideways market requires stronger breakout/mean-reversion confirmation.");

  const invalidations = evidenceCount((result as any).invalidationConditions);
  if (invalidations >= 1) reasons.push("A concrete invalidation condition is defined.");
  else blockers.push("No concrete invalidation condition was provided.");

  const finalScore = Math.min(100, Math.max(0, score));
  const approved = blockers.length === 0 && finalScore >= 85;

  return {
    approved,
    score: finalScore,
    reasons,
    blockers,
    grade: approved ? (finalScore >= 95 ? "A+" : "A") : "NO_TRADE",
  };
}

export function applySignalQualification(result: TradingAnalysis): TradingAnalysis {
  const qualification = qualifySignal(result);

  (result as any).signalQualification = qualification;

  if (qualification.approved) return result;

  return {
    ...result,
    signal: "WAIT",
    readiness: "NOT READY",
    estimatedConfidence: "LOW",
    riskDecision: "REJECTED",
    signalQuality: "AVOID",
    confidence: Math.min(result.confidence, qualification.score),
    explanation: `${result.explanation || "Signal rejected by deterministic validation."} Signal gate: ${qualification.blockers.join(" ")}`,
    reasoning: `${result.reasoning || ""} Deterministic signal qualification rejected the directional trade because the required independent confirmations were not satisfied.`,
    strategyConflicts: [
      ...(result.strategyConflicts || []),
      ...qualification.blockers,
    ],
  };
}
