import { UniversalAIResponseSchema, UniversalAIResponse } from "./schema";

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

export function extractJSON(text: string): any {
  if (text.includes("User Safety:")) {
    throw new Error(`The selected AI model's safety filter blocked the analysis or failed to output JSON. Raw: ${text}`);
  }

  try { return JSON.parse(text); } catch { /* continue */ }

  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch?.[1]) {
    try { return JSON.parse(markdownMatch[1]); } catch { /* continue */ }
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error(`No JSON payload found in AI response. Raw output: ${text.substring(0, 200)}...`);
  }

  const jsonSubset = text.substring(firstBrace, lastBrace + 1);
  const cleanJson = jsonSubset
    .replace(/\"\.\s*\"/g, '", "')
    .replace(/\\n/g, "\\\\n");

  try { return JSON.parse(cleanJson); }
  catch (err) { throw new Error(`JSON extracted but failed to parse: ${err instanceof Error ? err.message : "Unknown error"}. Raw: ${jsonSubset.substring(0, 200)}...`); }
}

export function normalizeResponse(rawText: string, defaultOverrides?: Partial<UniversalAIResponse>): UniversalAIResponse {
  try {
    const rawObj = extractJSON(rawText);
    const unified = rawObj.unifiedMarketData || rawObj.unified_market_data;
    const normalizedUnified = normalizeUnifiedMarketData(unified);

    const normalized = {
      ...rawObj,
      trend: rawObj.trend,
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
    };

    return UniversalAIResponseSchema.parse(normalized);
  } catch (error) {
    console.error("[AI Normalization/Validation Error]", error);

    return {
      trend: "Sideways", signal: "NO_TRADE", confidence: 0, readiness: "NOT READY", estimatedConfidence: "LOW", recommendedTimeframe: "", entryPrice: null, stopLoss: null, takeProfit: null,
      explanation: `[AI_ANALYSIS_INVALID] The AI produced an invalid or improperly formatted response. Reason: ${error instanceof Error ? error.message : "Unknown Zod Error"}`,
      requestedIndicators: [], requiredTimeframe: null, detectedSymbol: null, detectedTimeframe: null, exchange: null,
      marketProvider: defaultOverrides?.marketProvider || "unknown", riskDecision: "REJECTED", reasoning: "Invalid JSON format or schema failure.", dataConfidence: 0,
      analysisId: undefined, marketState: "Analysis Failed: Invalid JSON or Schema", changesFromPrevious: "None", momentum: "Unknown", candlestickBehavior: "Unknown", indicatorState: {}, strategyConsensus: "Unknown", strategyConflicts: [], bullishEvidence: [], bearishEvidence: [], invalidationConditions: [], evidenceScore: 0, signalQuality: "AVOID", confirmationStatus: "UNCLEAR", unifiedMarketData: undefined, riskReward: null, primaryTrend: undefined, shortTermDirection: undefined, structureTransition: undefined,
    };
  }
}
