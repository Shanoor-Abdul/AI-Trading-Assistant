import { UniversalAIRequest } from "./schema";

const SIGNALS = "STRONG_BUY | BUY | WAIT | UNSURE | NO_TRADE | SELL | STRONG_SELL";
const REGIMES = "TRENDING_UP | TRENDING_DOWN | RANGING | BREAKOUT | REVERSAL | UNCLEAR";

<<<<<<< HEAD
function safeJson(value: unknown): string {
  try { return JSON.stringify(value ?? null, null, 2); } catch { return "null"; }
}

function buildHistory(req: UniversalAIRequest): string {
  const history = req.partialBatch ? [...(req.progressiveState || []), req.partialBatch] : req.progressiveState || [];
  return history.length ? safeJson(history) : "No previous progressive history available.";
}

function buildBasePrompt(req: UniversalAIRequest): string {
  const strategies = req.selectedStrategies?.length ? req.selectedStrategies.join(", ") : "Auto";
  const indicators = req.visibleIndicators?.length ? req.visibleIndicators.join(", ") : "Only indicators actually visible in the supplied chart";

  return `
You are the VISUAL MARKET EVIDENCE ENGINE for an AI Trading Assistant.

You are the EYES. A deterministic TypeScript engine is the BRAIN.
Your job in progressive mode is to extract reliable visual evidence, not to invent a trade.

==================================================
NON-NEGOTIABLE ACCURACY RULES
==================================================
1. NEVER invent a value, level, indicator, candle, pattern, timeframe, symbol, or market fact.
2. NEVER manufacture an exact number from pixel position, trend direction, or an assumed formula.
3. If an exact number is clearly readable, copy the visible number exactly.
4. If an exact number is not readable, use null for the numeric field and describe only the qualitative state that is actually visible.
5. A confidence score is visual readability/evidence quality, NOT probability of winning.
6. Never claim 90%, 95%, or 100% probability of a profitable trade.
7. Never create Entry/SL/TP merely to satisfy the output schema.
8. Current incomplete candles are context only; do not treat them as confirmed closes.
9. Do not treat repeated frames as independent votes. They form one chronological series.
10. If evidence is insufficient or contradictory, preserve UNKNOWN/UNCLEAR instead of guessing.

==================================================
REQUESTED INDICATORS ARE A HARD EXTRACTION CHECKLIST
==================================================

The caller supplied this requested indicator list:
${indicators}

For EVERY requested indicator that is visibly present in the supplied screenshot, you MUST create a corresponding object under unifiedMarketData.indicators AND under the newest frame's frameObservations[].indicators.

Do NOT omit an indicator merely because its numeric value is unreadable.

If the indicator is visible but its number cannot be read, return for example:
{
  "RSI": { "value": null, "state": "ABOVE_50", "visible": true, "confidence": 70, "source": "visual" }
}

If the indicator is not visible at all:
{
  "RSI": { "value": null, "state": "NOT_VISIBLE", "visible": false, "confidence": 0, "source": "visual" }
}

The distinction between NOT_VISIBLE and VISIBLE_BUT_UNREADABLE is mandatory.

==================================================
INDICATOR EXTRACTION — DO THIS EXPLICITLY
==================================================

### RSI
When RSI is visible, extract:
- exact RSI numeric value if readable
- state: OVERBOUGHT / OVERSOLD / ABOVE_50 / BELOW_50 / NEUTRAL / RISING / FALLING / UNKNOWN
- whether the line is visibly above/below 70, 50, or 30
- direction of the RSI line if visually clear

Never infer an exact RSI number from a line position if the number is not readable.

### MACD
When MACD is visible, extract separately:
- MACD line value if readable
- signal line value if readable
- histogram value if readable
- histogram direction: RISING / FALLING / FLAT / UNKNOWN
- state: BULLISH / BEARISH / CROSSING_UP / CROSSING_DOWN / ABOVE_ZERO / BELOW_ZERO / NEUTRAL / UNKNOWN
- whether MACD line is above/below signal line if visually clear
- whether histogram is positive/negative if visually clear

Do NOT collapse MACD into one generic "neutral" value when the chart visibly provides more information.

### Bollinger Bands
When Bollinger Bands are visible, extract:
- upper band value if readable
- middle band value if readable
- lower band value if readable
- price position: ABOVE_UPPER / NEAR_UPPER / MIDDLE / NEAR_LOWER / BELOW_LOWER / UNKNOWN
- band state: EXPANDING / CONTRACTING / FLAT / UNKNOWN
- whether price has broken outside a band and whether it returned inside

If exact band numbers are not readable, keep the numeric fields null but preserve the visible qualitative state.

### ATR
When ATR is visible, extract:
- exact ATR value if readable
- volatility state: LOW / NORMAL / HIGH / RISING / FALLING / UNKNOWN
- line direction if visible

Never calculate ATR from the screenshot yourself.

### EMA/SMA/Volume if requested and visible
Extract exact numeric values only when readable, otherwise preserve qualitative position/state and null numeric values.

==================================================
PRICE / CANDLE / LEVEL EXTRACTION
==================================================

Extract when visibly supported:
- current price
- latest visible candle OHLC
- completed candle OHLC when the candle is actually closed
- current incomplete candle OHLC when identifiable
- recent swing high
- recent swing low
- support levels/zones
- resistance levels/zones
- breakout level
- failed breakout level
- invalidation level only when visually supported

For support/resistance, use numeric values only when the chart scale/label makes them readable. Otherwise return a descriptive zone with value null.

Do not invent support/resistance from a generic trend statement.

==================================================
MARKET STRUCTURE
==================================================

Identify only visible structure:
HH / HL / LH / LL
BOS
CHoCH
continuation
pullback
recovery
reversal developing
reversal confirmed
breakout attempt
confirmed breakout
false breakout
retest

A bullish candle after a bearish move is not automatically a reversal.

==================================================
CANDLE BEHAVIOR
==================================================

Extract when visible:
- bullish/bearish body
- body size
- upper wick
- lower wick
- rejection
- engulfing
- pin bar
- doji
- inside bar
- expansion/contraction

If candle OHLC is unreadable, do not invent it.

==================================================
MULTI-TIMEFRAME CONTEXT
==================================================

Do not majority-vote timeframes.
Use them as hierarchical context:
4H = macro context
1H = primary trend
15M = setup
5M = entry structure
2M = trigger
60S = micro confirmation
15S/30S = optional trigger refinement

Report timeframe conflicts explicitly.

==================================================
TEMPORAL EVIDENCE
==================================================

For every supplied image create exactly one frame observation.
Preserve chronological order.
The newest frame is the current state.
Older frames are historical context.

For each frame preserve:
- price
- candle data
- trend
- short-term direction
- structure
- momentum
- candle behavior
- ALL requested indicators
- support/resistance
- swing high/low
- breakout/invalidation when visible
- evidence groups
- confidence

Do not collapse a multi-frame request into one generic summary.

==================================================
BREAKOUT SAFETY
==================================================

A wick through a level is NOT a confirmed breakout.
Confirmation requires visible close/hold/follow-through and preferably retest when available.
If price immediately rejects the level, classify FALSE_BREAKOUT or UNCLEAR.

==================================================
EVIDENCE INDEPENDENCE
==================================================

Use independent groups:
structure, candle, momentum, indicators, supportResistance, volatility, volume, mtf.

Do not count the same underlying observation multiple times.

==================================================
SESSION CONTEXT
==================================================
Platform: ${req.platform}
Symbol: ${req.symbol}
Primary timeframe: ${req.primaryTimeframe}
Confirmation timeframe: ${req.confirmationTimeframe || "N/A"}
Trend timeframe: ${req.trendTimeframe || "N/A"}
Trade duration: ${req.tradeDuration || "N/A"}
Strategies: ${strategies}
Visible/requested indicators: ${indicators}
Previous analysis: ${safeJson(req.previousAnalysis)}
Previous market summary: ${safeJson(req.marketHistorySummary)}
Progressive history: ${buildHistory(req)}
`;
=======
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

  if (isApiData) {
    return `You are an evidence-first trading analysis model. Analyze exact supplied market data and supplementary screenshots.\n${context}\n${rules}\n` + responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode);
  }

  return `You are an evidence-first visual trading analysis model. Treat multiple frames as a chronological visual sequence, not independent screenshots.\n${context}\n${rules}\nAnalyze higher-timeframe images first when supplied, then the 5M sequence oldest to newest. Do not infer missing timeframes.\n` + responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode);
>>>>>>> feature/ai-signal-accuracy2
}

function responseSchema(timeframe: string, symbol: string, platform: string, mode: string): string {
  return `
<<<<<<< HEAD
==================================================
STRICT OUTPUT CONTRACT
==================================================
Return ONLY valid JSON. No markdown. No code fences. No prose outside JSON.

Use exactly this structure. Preserve nulls when a numeric value cannot be read.

{
  "trend": "Bullish | Bearish | Sideways",
  "signal": "${SIGNALS}",
  "confidence": 0,
  "readiness": "NOT READY | FAIR | GOOD | VERY GOOD | READY | READY / COMPLETE | EXCELLENT",
  "estimatedConfidence": "LOW | MEDIUM | HIGH",
=======
VALID JSON SHAPE
{
  "trend": "Sideways",
  "signal": "WAIT",
  "confidence": 0,
  "readiness": "NOT READY",
  "estimatedConfidence": "LOW",
>>>>>>> feature/ai-signal-accuracy2
  "recommendedTimeframe": "${timeframe}",
  "requiredTimeframe": null,
  "requestedIndicators": ["RSI", "MACD", "Bollinger Bands", "ATR"],
  "entryPrice": null,
  "stopLoss": null,
  "takeProfit": null,
  "marketState": "",
  "changesFromPrevious": "",
<<<<<<< HEAD
  "momentum": "",
  "candlestickBehavior": "",
=======
  "momentum": "UNKNOWN",
  "candlestickBehavior": "UNKNOWN",
>>>>>>> feature/ai-signal-accuracy2
  "indicatorState": {},
  "strategyConsensus": "Neutral",
  "strategyConflicts": [],
  "evidenceScore": 0,
<<<<<<< HEAD
  "signalQuality": "EXCELLENT | GOOD | FAIR | POOR | AVOID",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "invalidationConditions": [],
  "confirmationStatus": "CONFIRMED | DEVELOPING | WEAKENING | INVALIDATED | REVERSING | UNCLEAR",
=======
  "signalQuality": "AVOID",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "invalidationConditions": [],
  "confirmationStatus": "UNCLEAR",
>>>>>>> feature/ai-signal-accuracy2
  "explanation": "",
  "reasoning": "",
  "detectedSymbol": "${symbol}",
  "detectedTimeframe": "${timeframe}",
  "exchange": "${platform}",
  "marketProvider": "${mode}",
<<<<<<< HEAD
  "riskDecision": "APPROVED | UNSURE | REJECTED",
  "dataConfidence": 0,
  "riskReward": null,
=======
  "riskDecision": "UNSURE",
  "dataConfidence": 0,
>>>>>>> feature/ai-signal-accuracy2
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
<<<<<<< HEAD
    "indicators": {
      "RSI": { "value": null, "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" },
      "MACD": { "macd": null, "signal": null, "histogram": null, "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" },
      "Bollinger Bands": { "upper": null, "middle": null, "lower": null, "position": "UNKNOWN", "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" },
      "ATR": { "value": null, "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" }
    },
=======
    "indicators": {},
>>>>>>> feature/ai-signal-accuracy2
    "marketStructure": { "value": null, "source": "visual", "confidence": 0 },
    "trend": { "value": null, "source": "visual", "confidence": 0 },
    "momentum": { "value": null, "source": "visual", "confidence": 0 },
    "tradingSession": { "value": null, "source": "visual", "confidence": 0 },
    "swingHigh": { "value": null, "source": "visual", "confidence": 0 },
    "swingLow": { "value": null, "source": "visual", "confidence": 0 },
    "breakoutLevel": { "value": null, "source": "visual", "confidence": 0 },
    "invalidationLevel": { "value": null, "source": "visual", "confidence": 0 },
    "dataConflict": false,
    "conflictDetails": "",
    "frameObservations": [
      {
        "frameIndex": 1,
        "timestamp": null,
        "timeframe": "${timeframe}",
        "isPartial": false,
        "price": null,
        "completedCandle": null,
        "currentIncompleteCandle": null,
        "trend": "Unknown",
        "shortTermDirection": "Unknown",
        "structure": "",
        "momentum": "",
        "candleBehavior": "",
        "indicators": {
          "RSI": { "value": null, "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" },
          "MACD": { "macd": null, "signal": null, "histogram": null, "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" },
          "Bollinger Bands": { "upper": null, "middle": null, "lower": null, "position": "UNKNOWN", "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" },
          "ATR": { "value": null, "state": "UNKNOWN", "visible": false, "confidence": 0, "source": "visual" }
        },
        "levels": { "supportLevels": [], "resistanceLevels": [], "supportInteraction": "", "resistanceInteraction": "", "breakoutLevel": null, "invalidationLevel": null },
        "swingHigh": null,
        "swingLow": null,
        "marketRegime": "${REGIMES}",
        "bullishEvidenceGroups": [],
        "bearishEvidenceGroups": [],
        "invalidation": [],
        "confidence": 0
      }
    ],
    "temporalState": { "previousTrend": "", "currentDirection": "", "transition": "NONE", "regime": "UNCLEAR", "staleEvidence": [], "currentEvidence": [], "conflicts": [], "confirmationStatus": "UNCLEAR" },
    "evidenceGroups": { "structure": [], "candle": [], "momentum": [], "indicators": [], "supportResistance": [], "volatility": [], "volume": [], "mtf": [] }
  }
}

<<<<<<< HEAD
==================================================
MANDATORY INDICATOR COMPLETENESS CHECK
==================================================
Before returning JSON, compare requestedIndicators with unifiedMarketData.indicators.
Every requested indicator MUST have an object there.
Every requested indicator MUST also have an object in the newest frameObservations[].indicators.
If visible, set visible=true even if numeric fields are null.
If not visible, set visible=false and state=NOT_VISIBLE.
Never omit a requested indicator.

For the four platform indicators, use these exact keys:
"RSI"
"MACD"
"Bollinger Bands"
"ATR"

==================================================
SOURCE RULE
==================================================
Visual screenshot evidence => source "visual".
Explicit structured data supplied by caller => source "api".
Both independent sources agree => source "hybrid".
Never claim API data when none was supplied.

==================================================
PROGRESSIVE RULE
==================================================
Progressive analysis is evidence extraction only. Do not force BUY/SELL.
The deterministic local engine decides whether evidence is sufficient for a trade.
`;
}

export function buildUniversalPrompt(req: UniversalAIRequest): string {
  const base = buildBasePrompt(req);

  if (req.mode === "api_data") {
    return `${base}
==================================================
STRUCTURED DATA MODE
==================================================
Use supplied structured evidence as source of truth. Do not fabricate missing values.
CURRENT STRUCTURED DATA:
${safeJson(req.marketData)}
${responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode)}
`;
  }

  const screenshotCount = req.screenshots?.length || req.primaryTimeframePayload?.screenshots?.length || (req.screenshot ? 1 : 0);

  return `${base}
==================================================
VISUAL ANALYSIS MODE
==================================================
Images supplied: ${screenshotCount > 0 ? "YES" : "NO"}
Image count: ${screenshotCount}
Progressive mode: ${req.isProgressive ? "YES" : "NO"}

${screenshotCount > 1 ? "Analyze every supplied frame separately, then compare the chronological sequence. Do not collapse the sequence into one generic summary." : "Analyze the current chart only."}

${responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode)}
`;
}
=======
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
>>>>>>> feature/ai-signal-accuracy2
