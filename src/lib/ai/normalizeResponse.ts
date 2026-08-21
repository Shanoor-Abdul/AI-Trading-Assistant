import { UniversalAIResponseSchema, UniversalAIResponse } from "./schema";

<<<<<<< HEAD
function normalizeIndicatorSet(indicators: any): any {
  const input = indicators && typeof indicators === "object" ? indicators : {};
  const get = (...keys: string[]) => keys.map((key) => input[key]).find((value) => value !== undefined);
  const rsi = get("RSI", "rsi");
  const macd = get("MACD", "macd");
  const bb = get("Bollinger Bands", "BollingerBands", "bollingerBands", "BOLLINGER_BANDS", "bollinger");
  const atr = get("ATR", "atr");
  const normalized: Record<string, any> = { ...input };
  if (rsi !== undefined) normalized.RSI = rsi;
  if (macd !== undefined) normalized.MACD = macd;
  if (bb !== undefined) normalized["Bollinger Bands"] = bb;
  if (atr !== undefined) normalized.ATR = atr;
  return normalized;
}

function normalizeTrend(value: unknown): "Bullish" | "Bearish" | "Sideways" {
  if (typeof value !== "string") return "Sideways";
  const trend = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (["bullish", "trending_up", "uptrend", "up"].includes(trend)) return "Bullish";
  if (["bearish", "trending_down", "downtrend", "down"].includes(trend)) return "Bearish";

  // Unknown/unclear/neutral/ranging values cannot safely establish direction.
  // Normalize them to the schema-safe neutral market direction.
  return "Sideways";
}

function normalizeUnifiedMarketData(unified: any): any {
  if (!unified || typeof unified !== "object") return undefined;
  const normalized = {
    ...unified,
    currentPrice: unified.currentPrice || unified.current_price || { value: null, source: "visual", confidence: 0 },
    supportLevels: unified.supportLevels || unified.support_levels || { value: [], source: "visual", confidence: 0 },
    resistanceLevels: unified.resistanceLevels || unified.resistance_levels || { value: [], source: "visual", confidence: 0 },
    marketStructure: unified.marketStructure || unified.market_structure || { value: null, source: "visual", confidence: 0 },
    frameObservations: unified.frameObservations || unified.frame_observations || [],
    temporalState: unified.temporalState || unified.temporal_state || {},
    evidenceGroups: unified.evidenceGroups || unified.evidence_groups || {},
    indicators: normalizeIndicatorSet(unified.indicators),
  };
  normalized.frameObservations = normalized.frameObservations.map((frame: any) => ({
    ...frame,
    indicators: normalizeIndicatorSet(frame?.indicators),
  }));
  return normalized;
}

function repairJsonSyntax(input: string): string {
  // Conservative repair only: normalize line breaks inside strings and escape
  // quotes that are clearly inside a JSON string. We do not invent fields or values.
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        out += ch;
        continue;
      }

      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j += 1;
      const next = input[j];

      // A quote followed by JSON structural syntax is a closing quote.
      if (next === "," || next === "]" || next === "}" || next === ":" || j >= input.length) {
        inString = false;
        out += ch;
      } else {
        // Otherwise this is almost certainly an unescaped quote inside text.
        out += '\\"';
      }
      continue;
    }

    if (inString && (ch === "\n" || ch === "\r")) {
      out += "\\n";
      continue;
    }

    out += ch;
  }

  // Remove trailing commas before JSON closing tokens.
  return out.replace(/,\s*([}\]])/g, "$1");
}

function tryParse(candidate: string): any | undefined {
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(repairJsonSyntax(candidate));
    } catch {
      return undefined;
    }
  }
}

export function extractJSON(text: string): any {
=======
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
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
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
>>>>>>> feature/ai-signal-accuracy2
  if (text.includes("User Safety:")) {
    throw new Error(`The selected AI model's safety filter blocked the analysis. Raw: ${text}`);
  }

<<<<<<< HEAD
  const direct = tryParse(text.trim());
  if (direct !== undefined) return direct;

  const markdownMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const match of markdownMatches) {
    const parsed = tryParse(match[1]);
    if (parsed !== undefined) return parsed;
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error(`No JSON payload found in AI response. Raw output: ${text.substring(0, 200)}...`);
  }

  const jsonSubset = text.substring(firstBrace, lastBrace + 1);
  const parsed = tryParse(jsonSubset);
  if (parsed !== undefined) return parsed;

  throw new Error(`JSON extracted but failed to parse after conservative repair. Raw: ${jsonSubset.substring(0, 500)}...`);
=======
  const cleaned = stripMarkdownFences(text);
  const candidates = [
    cleaned,
    extractBalancedObject(cleaned) || "",
  ].filter(Boolean);

  let lastError: unknown;
  for (const candidate of candidates) {
    for (const value of [candidate, conservativeRepair(candidate)]) {
      try {
        return JSON.parse(value);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw new Error(
    `JSON extracted but failed to parse after conservative repair. ${lastError instanceof Error ? lastError.message : "Unknown parse error"}. Raw: ${cleaned.substring(0, 500)}...`,
  );
}

function normalizeEnum(value: unknown, allowed: string[], fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const found = allowed.find((item) => item.toUpperCase().replace(/[\s-]+/g, "_") === normalized);
  return found || fallback;
}

function numberOrNull(value: unknown): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
>>>>>>> feature/ai-signal-accuracy2
}

export function normalizeResponse(rawText: string, defaultOverrides?: Partial<UniversalAIResponse>): UniversalAIResponse {
  try {
    const rawObj = extractJSON(rawText);
<<<<<<< HEAD
    const unified = rawObj.unifiedMarketData || rawObj.unified_market_data;
    const normalizedUnified = normalizeUnifiedMarketData(unified);

    const normalized = {
      ...rawObj,
      trend: normalizeTrend(rawObj.trend),
      signal: rawObj.signal,
      confidence: rawObj.confidence,
      readiness: rawObj.readiness,
      estimatedConfidence: rawObj.estimatedConfidence || rawObj.estimated_confidence,
      recommendedTimeframe: rawObj.recommendedTimeframe || rawObj.recommended_timeframe,
      entryPrice: rawObj.entryPrice !== undefined ? rawObj.entryPrice : rawObj.entry_price,
      stopLoss: rawObj.stopLoss !== undefined ? rawObj.stopLoss : rawObj.stop_loss,
      takeProfit: rawObj.takeProfit !== undefined ? rawObj.takeProfit : rawObj.take_profit,
      requestedIndicators: rawObj.requestedIndicators || rawObj.requested_indicators || [],
      requiredTimeframe: rawObj.requiredTimeframe !== undefined ? rawObj.requiredTimeframe : (rawObj.required_timeframe ?? null),
      detectedSymbol: rawObj.detectedSymbol || rawObj.detected_symbol || null,
      detectedTimeframe: rawObj.detectedTimeframe || rawObj.detected_timeframe || null,
      exchange: rawObj.exchange || null,
      marketProvider: rawObj.marketProvider || rawObj.market_provider || defaultOverrides?.marketProvider || "unknown",
      riskDecision: rawObj.riskDecision || rawObj.risk_decision || "UNSURE",
      reasoning: rawObj.reasoning || rawObj.reason || "No reasoning provided",
      dataConfidence: rawObj.dataConfidence ?? rawObj.data_confidence ?? rawObj.confidence ?? 0,
      riskReward: rawObj.riskReward ?? rawObj.risk_reward ?? null,
      marketState: rawObj.marketState || rawObj.market_state,
      unifiedMarketData: normalizedUnified,
      changesFromPrevious: rawObj.changesFromPrevious || rawObj.changes_from_previous,
      momentum: rawObj.momentum,
      candlestickBehavior: rawObj.candlestickBehavior || rawObj.candlestick_behavior,
      indicatorState: normalizeIndicatorSet(rawObj.indicatorState || rawObj.indicator_state),
      strategyConsensus: rawObj.strategyConsensus || rawObj.strategy_consensus,
      strategyConflicts: rawObj.strategyConflicts || rawObj.strategy_conflicts,
      analysisId: rawObj.analysisId || rawObj.analysis_id,
      evidenceScore: rawObj.evidenceScore ?? rawObj.evidence_score,
      signalQuality: rawObj.signalQuality || rawObj.signal_quality,
      bullishEvidence: rawObj.bullishEvidence || rawObj.bullish_evidence || [],
      bearishEvidence: rawObj.bearishEvidence || rawObj.bearish_evidence || [],
      invalidationConditions: rawObj.invalidationConditions || rawObj.invalidation_conditions || [],
      confirmationStatus: rawObj.confirmationStatus || rawObj.confirmation_status,
      primaryTrend: rawObj.primaryTrend || rawObj.primary_trend,
      shortTermDirection: rawObj.shortTermDirection || rawObj.short_term_direction,
      structureTransition: rawObj.structureTransition || rawObj.structure_transition,
=======
    const normalized = {
      trend: normalizeEnum(rawObj.trend, ["Bullish", "Bearish", "Sideways"], "Sideways"),
      signal: normalizeEnum(rawObj.signal, ["STRONG_BUY", "BUY", "WAIT", "UNSURE", "NO_TRADE", "SELL", "STRONG_SELL"], "NO_TRADE"),
      confidence: Math.max(0, Math.min(100, Number(rawObj.confidence ?? 0))),
      readiness: normalizeEnum(rawObj.readiness, ["NOT READY", "FAIR", "GOOD", "VERY GOOD", "READY", "READY / COMPLETE", "EXCELLENT"], "NOT READY"),
      estimatedConfidence: normalizeEnum(rawObj.estimatedConfidence ?? rawObj.estimated_confidence, ["LOW", "MEDIUM", "HIGH"], "LOW"),
      recommendedTimeframe: String(rawObj.recommendedTimeframe ?? rawObj.recommended_timeframe ?? ""),
      entryPrice: numberOrNull(rawObj.entryPrice ?? rawObj.entry_price),
      stopLoss: numberOrNull(rawObj.stopLoss ?? rawObj.stop_loss),
      takeProfit: numberOrNull(rawObj.takeProfit ?? rawObj.take_profit),
      explanation: String(rawObj.explanation ?? ""),
      requestedIndicators: Array.isArray(rawObj.requestedIndicators ?? rawObj.requested_indicators) ? (rawObj.requestedIndicators ?? rawObj.requested_indicators) : [],
      requiredTimeframe: rawObj.requiredTimeframe ?? rawObj.required_timeframe ?? null,
      detectedSymbol: rawObj.detectedSymbol ?? rawObj.detected_symbol ?? null,
      detectedTimeframe: rawObj.detectedTimeframe ?? rawObj.detected_timeframe ?? null,
      exchange: rawObj.exchange ?? null,
      marketProvider: normalizeEnum(rawObj.marketProvider ?? rawObj.market_provider ?? defaultOverrides?.marketProvider, ["visual_only", "ccxt", "broker_api", "unknown"], defaultOverrides?.marketProvider || "unknown"),
      riskDecision: String(rawObj.riskDecision ?? rawObj.risk_decision ?? "UNSURE"),
      reasoning: String(rawObj.reasoning ?? rawObj.reason ?? "No reasoning provided"),
      dataConfidence: Math.max(0, Math.min(100, Number(rawObj.dataConfidence ?? rawObj.data_confidence ?? rawObj.confidence ?? 0))),
      riskReward: typeof rawObj.riskReward === "number" ? rawObj.riskReward : undefined,
      marketState: rawObj.marketState ?? rawObj.market_state,
      unifiedMarketData: rawObj.unifiedMarketData ?? rawObj.unified_market_data,
      changesFromPrevious: rawObj.changesFromPrevious ?? rawObj.changes_from_previous,
      momentum: rawObj.momentum,
      candlestickBehavior: rawObj.candlestickBehavior ?? rawObj.candlestick_behavior,
      indicatorState: rawObj.indicatorState ?? rawObj.indicator_state ?? {},
      strategyConsensus: rawObj.strategyConsensus ?? rawObj.strategy_consensus,
      strategyConflicts: Array.isArray(rawObj.strategyConflicts ?? rawObj.strategy_conflicts) ? (rawObj.strategyConflicts ?? rawObj.strategy_conflicts) : [],
      analysisId: rawObj.analysisId ?? rawObj.analysis_id,
      evidenceScore: rawObj.evidenceScore ?? rawObj.evidence_score,
      signalQuality: rawObj.signalQuality ?? rawObj.signal_quality,
      bullishEvidence: Array.isArray(rawObj.bullishEvidence ?? rawObj.bullish_evidence) ? (rawObj.bullishEvidence ?? rawObj.bullish_evidence) : [],
      bearishEvidence: Array.isArray(rawObj.bearishEvidence ?? rawObj.bearish_evidence) ? (rawObj.bearishEvidence ?? rawObj.bearish_evidence) : [],
      invalidationConditions: Array.isArray(rawObj.invalidationConditions ?? rawObj.invalidation_conditions) ? (rawObj.invalidationConditions ?? rawObj.invalidation_conditions) : [],
      confirmationStatus: rawObj.confirmationStatus ?? rawObj.confirmation_status,
>>>>>>> feature/ai-signal-accuracy2
    };

    return UniversalAIResponseSchema.parse(normalized);
  } catch (error) {
    console.error("[AI Normalization/Validation Error]", error);
    return {
<<<<<<< HEAD
      trend: "Sideways", signal: "NO_TRADE", confidence: 0, readiness: "NOT READY", estimatedConfidence: "LOW", recommendedTimeframe: "", entryPrice: null, stopLoss: null, takeProfit: null,
      explanation: `[AI_ANALYSIS_INVALID] The AI produced an invalid or improperly formatted response. Reason: ${error instanceof Error ? error.message : "Unknown Zod Error"}`,
      requestedIndicators: [], requiredTimeframe: null, detectedSymbol: null, detectedTimeframe: null, exchange: null,
      marketProvider: defaultOverrides?.marketProvider || "unknown", riskDecision: "REJECTED", reasoning: "Invalid JSON format or schema failure.", dataConfidence: 0,
      analysisId: undefined, marketState: "Analysis Failed: Invalid JSON or Schema", changesFromPrevious: "None", momentum: "Unknown", candlestickBehavior: "Unknown", indicatorState: {}, strategyConsensus: "Unknown", strategyConflicts: [], bullishEvidence: [], bearishEvidence: [], invalidationConditions: [], evidenceScore: 0, signalQuality: "AVOID", confirmationStatus: "UNCLEAR", unifiedMarketData: undefined, riskReward: null, primaryTrend: undefined, shortTermDirection: undefined, structureTransition: undefined,
=======
      trend: "Sideways",
      signal: "NO_TRADE",
      confidence: 0,
      readiness: "NOT READY",
      estimatedConfidence: "LOW",
      recommendedTimeframe: "",
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      explanation: `[AI_ANALYSIS_INVALID] The AI produced an invalid or improperly formatted response. Reason: ${error instanceof Error ? error.message : "Unknown validation error"}`,
      requestedIndicators: [],
      requiredTimeframe: null,
      detectedSymbol: null,
      detectedTimeframe: null,
      exchange: null,
      marketProvider: defaultOverrides?.marketProvider || "unknown",
      riskDecision: "REJECTED",
      reasoning: "Invalid JSON format or schema failure.",
      dataConfidence: 0,
      analysisId: undefined,
      marketState: "Analysis Failed: Invalid JSON or Schema",
      changesFromPrevious: "None",
      momentum: "Unknown",
      candlestickBehavior: "Unknown",
      indicatorState: {},
      strategyConsensus: "Unknown",
      strategyConflicts: [],
      bullishEvidence: [],
      bearishEvidence: [],
      invalidationConditions: [],
      evidenceScore: 0,
      signalQuality: "AVOID",
      confirmationStatus: "UNCLEAR",
>>>>>>> feature/ai-signal-accuracy2
    };
  }
}
