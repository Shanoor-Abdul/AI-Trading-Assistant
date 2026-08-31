import { UniversalAIResponseSchema, UniversalAIResponse } from "./schema";

function stripMarkdownFences(text: string): string {
  const match = text.match(/```(?:json|jsonc)?\s*([\s\S]*?)\s*```/i);
  return match?.[1]?.trim() || text.trim();
}

function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function conservativeRepair(json: string): string {
  return json
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:/g, '$1"$2":')
    .replace(/:\s*'([^']*)'/g, ': "$1"');
}

export function extractJSON(text: string): any {
  if (!text?.trim()) throw new Error("AI returned an empty response.");
  if (text.includes("User Safety:")) throw new Error("The selected AI model's safety filter blocked the analysis.");

  const cleaned = stripMarkdownFences(text);
  const candidates = [cleaned, extractBalancedObject(cleaned) || ""].filter(Boolean);
  let lastError: unknown;

  for (const candidate of candidates) {
    for (const value of [candidate, conservativeRepair(candidate)]) {
      try { return JSON.parse(value); }
      catch (error) { lastError = error; }
    }
  }

  throw new Error(`JSON parse failed: ${lastError instanceof Error ? lastError.message : "Unknown error"}`);
}

function normalizeEnum(value: unknown, allowed: string[], fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return allowed.find(item => item.toUpperCase().replace(/[\s-]+/g, "_") === normalized) || fallback;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function percentage(value: unknown): number {
  const n = numberOrNull(value);
  return n === null ? 0 : Math.max(0, Math.min(100, n));
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizeResponse(rawText: string, defaultOverrides?: Partial<UniversalAIResponse>): UniversalAIResponse {
  const rawObj = extractJSON(rawText);

  const normalized: any = {
    trend: normalizeEnum(rawObj.trend, ["Bullish", "Bearish", "Sideways"], "Sideways"),
    signal: normalizeEnum(rawObj.signal, ["STRONG_BUY", "BUY", "WAIT", "UNSURE", "NO_TRADE", "SELL", "STRONG_SELL", "GOOD", "BAD"], "NO_TRADE"),
    confidence: percentage(rawObj.confidence),
    readiness: normalizeEnum(rawObj.readiness, ["NOT READY", "FAIR", "GOOD", "VERY GOOD", "READY", "READY / COMPLETE", "EXCELLENT"], "NOT READY"),
    estimatedConfidence: normalizeEnum(rawObj.estimatedConfidence ?? rawObj.estimated_confidence, ["LOW", "MEDIUM", "HIGH"], "LOW"),
    recommendedTimeframe: String(rawObj.recommendedTimeframe ?? rawObj.recommended_timeframe ?? ""),
    entryPrice: numberOrNull(rawObj.entryPrice ?? rawObj.entry_price),
    stopLoss: numberOrNull(rawObj.stopLoss ?? rawObj.stop_loss),
    takeProfit: numberOrNull(rawObj.takeProfit ?? rawObj.take_profit),
    explanation: typeof rawObj.explanation === "string" ? rawObj.explanation : "",
    requestedIndicators: stringArray(rawObj.requestedIndicators ?? rawObj.requested_indicators),
    requiredTimeframe: typeof (rawObj.requiredTimeframe ?? rawObj.required_timeframe) === "string" ? (rawObj.requiredTimeframe ?? rawObj.required_timeframe) : null,
    detectedSymbol: typeof (rawObj.detectedSymbol ?? rawObj.detected_symbol) === "string" ? (rawObj.detectedSymbol ?? rawObj.detected_symbol) : null,
    detectedTimeframe: typeof (rawObj.detectedTimeframe ?? rawObj.detected_timeframe) === "string" ? (rawObj.detectedTimeframe ?? rawObj.detected_timeframe) : null,
    exchange: typeof rawObj.exchange === "string" ? rawObj.exchange : null,
    marketProvider: normalizeEnum(rawObj.marketProvider ?? rawObj.market_provider ?? defaultOverrides?.marketProvider, ["visual_only", "ccxt", "broker_api", "unknown"], defaultOverrides?.marketProvider || "unknown"),
    riskDecision: typeof (rawObj.riskDecision ?? rawObj.risk_decision) === "string" ? (rawObj.riskDecision ?? rawObj.risk_decision) : "UNSURE",
    reasoning: typeof (rawObj.reasoning ?? rawObj.reason) === "string" ? (rawObj.reasoning ?? rawObj.reason) : "No reasoning provided",
    dataConfidence: percentage(rawObj.dataConfidence ?? rawObj.data_confidence ?? rawObj.confidence),
    riskReward: numberOrNull(rawObj.riskReward ?? rawObj.risk_reward) ?? undefined,
    marketState: optionalString(rawObj.marketState ?? rawObj.market_state),
    unifiedMarketData: rawObj.unifiedMarketData ?? rawObj.unified_market_data,
    changesFromPrevious: optionalString(rawObj.changesFromPrevious ?? rawObj.changes_from_previous),
    momentum: optionalString(rawObj.momentum),
    candlestickBehavior: optionalString(rawObj.candlestickBehavior ?? rawObj.candlestick_behavior),
    indicatorState: rawObj.indicatorState ?? rawObj.indicator_state ?? {},
    strategyConsensus: optionalString(rawObj.strategyConsensus ?? rawObj.strategy_consensus),
    strategyConflicts: stringArray(rawObj.strategyConflicts ?? rawObj.strategy_conflicts),
    analysisId: optionalString(rawObj.analysisId ?? rawObj.analysis_id),
    evidenceScore: percentage(rawObj.evidenceScore ?? rawObj.evidence_score),
    signalQuality: normalizeEnum(rawObj.signalQuality ?? rawObj.signal_quality, ["EXCELLENT", "GOOD", "FAIR", "POOR", "AVOID"], "AVOID"),
    bullishEvidence: stringArray(rawObj.bullishEvidence ?? rawObj.bullish_evidence),
    bearishEvidence: stringArray(rawObj.bearishEvidence ?? rawObj.bearish_evidence),
    invalidationConditions: stringArray(rawObj.invalidationConditions ?? rawObj.invalidation_conditions),
    confirmationStatus: normalizeEnum(rawObj.confirmationStatus ?? rawObj.confirmation_status, ["CONFIRMED", "DEVELOPING", "WEAKENING", "INVALIDATED", "REVERSING", "UNCLEAR"], "UNCLEAR"),
  };

  // The AI's core signal is useful even when the optional nested market-data
  // object is malformed. Do not discard the entire analysis because of it.
  const parsed = UniversalAIResponseSchema.safeParse(normalized);
  if (parsed.success) return parsed.data;

  console.warn("[AI Normalization] Nested market data failed validation; returning core analysis.", parsed.error.issues);
  try {
    require("fs").writeFileSync(
      require("path").join(process.cwd(), "debug_frames", "zod_error.json"),
      JSON.stringify(parsed.error.issues, null, 2)
    );
  } catch (e) {}
  delete normalized.unifiedMarketData;

  const core = UniversalAIResponseSchema.safeParse(normalized);
  if (core.success) return core.data;

  // Last-resort valid response: preserve the model's readable reasoning/evidence.
  return {
    trend: normalized.trend,
    signal: normalized.signal,
    confidence: normalized.confidence,
    readiness: normalized.readiness,
    estimatedConfidence: normalized.estimatedConfidence,
    recommendedTimeframe: normalized.recommendedTimeframe,
    entryPrice: normalized.entryPrice,
    stopLoss: normalized.stopLoss,
    takeProfit: normalized.takeProfit,
    explanation: normalized.explanation,
    requestedIndicators: normalized.requestedIndicators,
    requiredTimeframe: normalized.requiredTimeframe,
    detectedSymbol: normalized.detectedSymbol,
    detectedTimeframe: normalized.detectedTimeframe,
    exchange: normalized.exchange,
    marketProvider: normalized.marketProvider,
    riskDecision: normalized.riskDecision,
    reasoning: normalized.reasoning,
    dataConfidence: normalized.dataConfidence,
    riskReward: normalized.riskReward,
    marketState: normalized.marketState,
    changesFromPrevious: normalized.changesFromPrevious,
    momentum: normalized.momentum,
    candlestickBehavior: normalized.candlestickBehavior,
    indicatorState: normalized.indicatorState,
    strategyConsensus: normalized.strategyConsensus,
    strategyConflicts: normalized.strategyConflicts,
    analysisId: normalized.analysisId,
    evidenceScore: normalized.evidenceScore,
    signalQuality: normalized.signalQuality,
    bullishEvidence: normalized.bullishEvidence,
    bearishEvidence: normalized.bearishEvidence,
    invalidationConditions: normalized.invalidationConditions,
    confirmationStatus: normalized.confirmationStatus,
  } as UniversalAIResponse;
}
