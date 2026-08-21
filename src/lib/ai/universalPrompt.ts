import { UniversalAIRequest } from "./schema";

const SIGNALS = "STRONG_BUY | BUY | WAIT | UNSURE | NO_TRADE | SELL | STRONG_SELL";

export function buildUniversalPrompt(req: UniversalAIRequest): string {
  const isApiData = req.mode === "api_data" && req.marketData;
  const strategies = req.selectedStrategies?.length ? req.selectedStrategies.join(", ") : "None specified";
  const indicators = req.visibleIndicators?.length ? req.visibleIndicators.join(", ") : "None specified";
  const history = req.progressiveState?.length ? JSON.stringify(req.progressiveState, null, 2) : "None";
  const previous = req.previousAnalysis ? JSON.stringify(req.previousAnalysis, null, 2) : "None";
  const mtf = [
    `4H Macro Trend Image: ${req.macroTimeframe ? "AVAILABLE" : "MISSING"}`,
    `1H Confirmation Image: ${req.confirmationTimeframeImage ? "AVAILABLE" : "MISSING"}`,
    `15M Structure Image: ${req.structureTimeframe ? "AVAILABLE" : "MISSING"}`,
    `5M Primary Frames: ${req.primaryTimeframePayload?.screenshots?.length || req.screenshots?.length || 0}`,
  ].join("\n");

  const rules = `
EVIDENCE RULES
- Use only evidence actually present in supplied market data or visible images.
- Never invent exact price, volume, RSI, MACD, Bollinger Bands, ATR, order-book, liquidation, account, or execution values.
- If a value cannot be read reliably, use null and mark its state UNKNOWN.
- Evaluate bullish and bearish evidence independently before selecting a signal.
- Conflicting or insufficient evidence must reduce confidence and normally produce WAIT, UNSURE, or NO_TRADE.
- Do not increase confidence because more frames exist; confidence comes from meaningful independent evidence.
- Compare the current evidence with previousAnalysis and progressiveState when present.
- Entries with source=manual are prior user conclusions and must be explicitly compared, not blindly copied.
- Missing higher-timeframe images must lower data confidence/readiness rather than being inferred.
- Progressive mode is observation-first. Do not manufacture BUY/SELL activity.
- Do not expose private chain-of-thought. Return only a concise user-facing reasoning summary.
- confidence, evidenceScore, and dataConfidence are integer percentages from 0 to 100.

OUTPUT CONTRACT
Return ONLY one valid JSON object. No markdown fences. No prose before or after JSON. No comments. No trailing commas.
Every property must use valid JSON double quotes. Match the exact field names and enum values in the schema below.
`;

  const context = `
PLATFORM: ${req.platform}
SYMBOL: ${req.symbol}
PRIMARY TIMEFRAME: ${req.primaryTimeframe}
CONFIRMATION TIMEFRAME: ${req.confirmationTimeframe || "N/A"}
TREND TIMEFRAME: ${req.trendTimeframe || "N/A"}
TRADE DURATION: ${req.tradeDuration || "N/A"}
SELECTED STRATEGIES: ${strategies}
VISIBLE INDICATORS: ${indicators}
PREVIOUS ANALYSIS: ${previous}
PROGRESSIVE HISTORY: ${history}
${mtf}
`;

  if (isApiData) return `You are an evidence-first trading analysis model. Analyze exact supplied market data and supplementary screenshots.\n${context}\n${rules}\n${responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode)}`;
  return `You are an evidence-first visual trading analysis model. Treat multiple frames as a chronological visual sequence, not independent screenshots.\n${context}\n${rules}\nAnalyze higher-timeframe images first when supplied, then the 5M sequence oldest to newest. Do not infer missing timeframes.\n${responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode)}`;
}

function responseSchema(timeframe: string, symbol: string, platform: string, mode: string): string {
  return `
VALID JSON SHAPE
{
  "trend": "Sideways",
  "signal": "WAIT",
  "confidence": 0,
  "readiness": "NOT READY",
  "estimatedConfidence": "LOW",
  "recommendedTimeframe": "${timeframe}",
  "requiredTimeframe": null,
  "requestedIndicators": [],
  "entryPrice": null,
  "stopLoss": null,
  "takeProfit": null,
  "marketState": "",
  "changesFromPrevious": "",
  "momentum": "UNKNOWN",
  "candlestickBehavior": "UNKNOWN",
  "indicatorState": {},
  "strategyConsensus": "Neutral",
  "strategyConflicts": [],
  "evidenceScore": 0,
  "signalQuality": "AVOID",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "invalidationConditions": [],
  "confirmationStatus": "UNCLEAR",
  "explanation": "",
  "reasoning": "",
  "detectedSymbol": "${symbol}",
  "detectedTimeframe": "${timeframe}",
  "exchange": "${platform}",
  "marketProvider": "${mode}",
  "riskDecision": "UNSURE",
  "dataConfidence": 0,
  "unifiedMarketData": {
    "symbol": "${symbol}",
    "timeframe": "${timeframe}",
    "currentPrice": { "value": null, "source": "visual", "confidence": 0 },
    "completedCandle": null,
    "currentIncompleteCandle": null,
    "volume": { "value": null, "source": "visual", "confidence": 0 },
    "bidAskSpread": { "value": null, "source": "visual", "confidence": 0 },
    "supportLevels": { "value": [], "source": "visual", "confidence": 0 },
    "resistanceLevels": { "value": [], "source": "visual", "confidence": 0 },
    "indicators": {},
    "marketStructure": { "value": null, "source": "visual", "confidence": 0 },
    "trend": { "value": null, "source": "visual", "confidence": 0 },
    "momentum": { "value": null, "source": "visual", "confidence": 0 },
    "tradingSession": { "value": null, "source": "visual", "confidence": 0 },
    "dataConflict": false,
    "conflictDetails": ""
  }
}

ENUMS
trend: Bullish | Bearish | Sideways
signal: ${SIGNALS}
readiness: NOT READY | FAIR | GOOD | VERY GOOD | READY | READY / COMPLETE | EXCELLENT
estimatedConfidence: LOW | MEDIUM | HIGH
strategyConsensus: Bullish | Bearish | Neutral | Mixed
signalQuality: EXCELLENT | GOOD | FAIR | POOR | AVOID
confirmationStatus: CONFIRMED | DEVELOPING | WEAKENING | INVALIDATED | REVERSING | UNCLEAR
riskDecision: APPROVED | UNSURE | REJECTED

UNIFIED DATA
Use source=visual for values read from images. Use null when unreadable. Never fabricate missing data.
`;
}
