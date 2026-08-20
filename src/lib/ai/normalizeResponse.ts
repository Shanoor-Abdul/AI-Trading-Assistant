import { UniversalAIResponseSchema, UniversalAIResponse } from "./schema";

export function extractJSON(text: string): any {
  if (text.includes("User Safety:")) {
    throw new Error(`The selected AI model's safety filter blocked the analysis or failed to output JSON. Raw: ${text}`);
  }

  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
    try { return JSON.parse(markdownMatch[1]); } catch { /* continue */ }
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON payload found in AI response. Raw output: ${text.substring(0, 200)}...`);
  }

  const cleanJson = jsonMatch[0]
    .replace(/\"\.\s*\"/g, '", "')
    .replace(/\\n/g, "\\\\n");

  return JSON.parse(cleanJson);
}

export function normalizeResponse(rawText: string, defaultOverrides?: Partial<UniversalAIResponse>): UniversalAIResponse {
  try {
    const rawObj = extractJSON(rawText);

    const normalized = {
      trend: rawObj.trend,
      signal: rawObj.signal,
      confidence: rawObj.confidence,
      readiness: rawObj.readiness,
      estimatedConfidence: rawObj.estimatedConfidence || rawObj.estimated_confidence,
      recommendedTimeframe: rawObj.recommendedTimeframe || rawObj.recommended_timeframe,
      entryPrice: rawObj.entryPrice !== undefined ? rawObj.entryPrice : rawObj.entry_price,
      stopLoss: rawObj.stopLoss !== undefined ? rawObj.stopLoss : rawObj.stop_loss,
      takeProfit: rawObj.takeProfit !== undefined ? rawObj.takeProfit : rawObj.take_profit,
      explanation: rawObj.explanation,
      requestedIndicators: rawObj.requestedIndicators || rawObj.requested_indicators || [],
      requiredTimeframe: rawObj.requiredTimeframe !== undefined ? rawObj.requiredTimeframe : (rawObj.required_timeframe || null),
      detectedSymbol: rawObj.detectedSymbol || rawObj.detected_symbol || null,
      detectedTimeframe: rawObj.detectedTimeframe || rawObj.detected_timeframe || null,
      exchange: rawObj.exchange || null,
      marketProvider: rawObj.marketProvider || rawObj.market_provider || defaultOverrides?.marketProvider || "unknown",
      riskDecision: rawObj.riskDecision || rawObj.risk_decision || "UNSURE",
      reasoning: rawObj.reasoning || rawObj.reason || "No reasoning provided",
      dataConfidence: rawObj.dataConfidence || rawObj.data_confidence || rawObj.confidence || 0,
      riskReward: rawObj.riskReward ?? rawObj.risk_reward,
      marketState: rawObj.marketState || rawObj.market_state,
      unifiedMarketData: rawObj.unifiedMarketData || rawObj.unified_market_data,
      changesFromPrevious: rawObj.changesFromPrevious || rawObj.changes_from_previous,
      momentum: rawObj.momentum,
      candlestickBehavior: rawObj.candlestickBehavior || rawObj.candlestick_behavior,
      indicatorState: rawObj.indicatorState || rawObj.indicator_state,
      strategyConsensus: rawObj.strategyConsensus || rawObj.strategy_consensus,
      strategyConflicts: rawObj.strategyConflicts || rawObj.strategy_conflicts,
      analysisId: rawObj.analysisId || rawObj.analysis_id,
      evidenceScore: rawObj.evidenceScore ?? rawObj.evidence_score,
      signalQuality: rawObj.signalQuality || rawObj.signal_quality,
      bullishEvidence: rawObj.bullishEvidence || rawObj.bullish_evidence || [],
      bearishEvidence: rawObj.bearishEvidence || rawObj.bearish_evidence || [],
      invalidationConditions: rawObj.invalidationConditions || rawObj.invalidation_conditions || [],
      confirmationStatus: rawObj.confirmationStatus || rawObj.confirmation_status,
    };

    return UniversalAIResponseSchema.parse(normalized);
  } catch (error) {
    console.error("[AI Normalization/Validation Error]", error);

    return {
      trend: "Sideways",
      signal: "NO_TRADE",
      confidence: 0,
      readiness: "NOT READY",
      estimatedConfidence: "LOW",
      recommendedTimeframe: "",
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      explanation: `[AI_ANALYSIS_INVALID] The AI produced an invalid or improperly formatted response. Reason: ${error instanceof Error ? error.message : "Unknown Zod Error"}`,
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
      marketState: "Analysis Failed: Invalid JSON or Filtered",
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
      unifiedMarketData: undefined,
      riskReward: undefined,
    };
  }
}
