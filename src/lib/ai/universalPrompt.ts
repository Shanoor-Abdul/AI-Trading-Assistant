import { UniversalAIRequest } from "./schema";

const SIGNALS = "STRONG_BUY | BUY | WAIT | UNSURE | NO_TRADE | SELL | STRONG_SELL";

export function buildUniversalPrompt(req: UniversalAIRequest): string {
  const isApiData = req.mode === "api_data" && req.marketData;
  const strategiesList = req.selectedStrategies && req.selectedStrategies.length > 0
    ? req.selectedStrategies.map((s) => `- ${s}`).join("\n")
    : "None specified";
  const indicatorsList = req.visibleIndicators && req.visibleIndicators.length > 0
    ? req.visibleIndicators.map((i) => `- ${i}`).join("\n")
    : "None specified";
  
  let historyState = req.progressiveState || [];
  if (req.partialBatch) {
    historyState = [...historyState, req.partialBatch];
  }
  
  const history = historyState.length > 0
    ? JSON.stringify(historyState, null, 2)
    : "None";
  const previous = req.previousAnalysis ? JSON.stringify(req.previousAnalysis, null, 2) : "None";
  const mtfContext = [
    `4H Macro Trend Image: ${req.macroTimeframe ? "AVAILABLE" : "MISSING"}`,
    `1H Confirmation Image: ${req.confirmationTimeframeImage ? "AVAILABLE" : "MISSING"}`,
    `15M Market Structure Image: ${req.structureTimeframe ? "AVAILABLE" : "MISSING"}`,
    `5M Primary Frames: ${req.primaryTimeframePayload?.screenshots?.length || (req.screenshots?.length || 1)}AVAILABLE`
  ].join("\n");

  if (isApiData) {
    return `
You are an evidence-first trading analysis model.

Analyze the supplied exact market data, indicators, strategy rules, and any provided screenshots.
Do not invent missing values.
Do not expose private chain-of-thought. Return concise, structured, user-facing evidence only.

MARKET CONTEXT
Symbol: ${req.symbol}
Primary timeframe: ${req.primaryTimeframe}
Confirmation timeframe: ${req.confirmationTimeframe || "N/A"}
Trend timeframe: ${req.trendTimeframe || "N/A"}
Trade duration: ${req.tradeDuration || "N/A"}
Platform: ${req.platform}

SELECTED STRATEGIES
${strategiesList}

VISIBLE INDICATORS
${indicatorsList}

PREVIOUS ANALYSIS
${previous}

PROGRESSIVE HISTORY
${history}

EVIDENCE-FIRST DECISION RULES
1. Evaluate higher-timeframe context before the entry timeframe when those inputs exist.
2. Evaluate trend/structure, momentum, support/resistance, candle behavior, indicators, volume, and market regime.
3. Evaluate both bullish and bearish evidence before choosing a direction.
4. Treat conflicting evidence as a reason to reduce confidence.
5. A strong signal requires multiple independent pieces of agreeing evidence; never increase confidence merely because more data exists.
6. Identify concrete invalidation conditions for the current thesis.
7. Compare against the previous analysis and state whether the thesis is strengthened, weakening, invalidated, reversing, developing, continuing, or unclear.
8. If the evidence is insufficient or contradictory, prefer WAIT/UNSURE/NO_TRADE rather than forcing BUY/SELL.
9. Never fabricate order-book, volume, indicator, price, or liquidation values when unavailable.
10. Confidence must reflect evidence quality, not certainty about the future.
11. Progressive history may contain entries with source=manual. Treat those entries as completed user-requested conclusions and explicitly compare the newest evidence against the most recent manual conclusion.

API DATA
Use exact numerical market values when provided. Screenshots are supplementary visual evidence.

Return ONLY valid JSON matching UniversalAIResponse.
` + responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode);
  }

  const isSingleImage = (req.screenshots && req.screenshots.length === 1) || (!req.screenshots && req.screenshot);

  if (isSingleImage) {
    return `
VISUAL-ONLY TRADING ANALYSIS

Analyze the provided chart screenshot using only information that is actually visible plus the user settings below.
Do not invent exact numerical values that cannot be read.
Do not expose private chain-of-thought.

PLATFORM: ${req.platform}
SYMBOL: ${req.symbol}
PRIMARY TIMEFRAME: ${req.primaryTimeframe}
CONFIRMATION TIMEFRAME: ${req.confirmationTimeframe || "N/A"}
TREND TIMEFRAME: ${req.trendTimeframe || "N/A"}
TRADE DURATION: ${req.tradeDuration || "N/A"}

SELECTED STRATEGIES
${strategiesList}

VISIBLE INDICATORS
${indicatorsList}

PREVIOUS ANALYSIS
${previous}

PROGRESSIVE HISTORY
${history}

SINGLE-FRAME EVIDENCE RULES
- Analyze market structure, trend, momentum, recent candle behavior, visible indicators, support/resistance, and strategy alignment.
- Evaluate bullish and bearish evidence separately.
- Identify what would invalidate the current thesis.
- If the screenshot does not provide enough evidence for a reliable directional decision, prefer WAIT or UNSURE.
- Do not claim STRONG_BUY/STRONG_SELL from a single weak clue.
- Confidence must reflect evidence quality.
- If progressive history contains source=manual, treat the latest manual entry as a prior conclusion and explain whether this new screenshot strengthens, weakens, invalidates, or reverses it.

Return ONLY valid JSON matching UniversalAIResponse.
` + responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode);
  }

  return `
UNIVERSAL AI — CHRONOLOGICAL VISUAL SEQUENCE ANALYSIS

This request contains a chronological sequence of chart frames from the same trading session.
Treat the images as a visual time series, NOT independent screenshots.
Do not expose private chain-of-thought. Return concise, user-facing evidence and conclusions.

==================================================
SESSION
==================================================
Platform: ${req.platform}
Symbol: ${req.symbol}
Primary timeframe: ${req.primaryTimeframe}
Confirmation timeframe: ${req.confirmationTimeframe || "N/A"}
Trend timeframe: ${req.trendTimeframe || "N/A"}
Trade duration: ${req.tradeDuration || "N/A"}

Selected strategies:
${strategiesList}

Visible indicators:
${indicatorsList}

Previous analysis:
${previous}

Previous progressive state:
${history}

==================================================
TEMPORAL & MULTI-TIMEFRAME (MTF) ANALYSIS
==================================================
${mtfContext}

If higher timeframe screenshots (4H, 1H, 15M) are provided, you MUST analyze them hierarchically before analyzing the 5M primary frames:

STEP 1: Analyze 4H macro direction (if available).
STEP 2: Analyze 1H confirmation (if available).
STEP 3: Analyze 15M market structure (if available).
STEP 4: Analyze the chronological 5M primary frames for entry, momentum, candlestick behavior, and short-term changes.
STEP 5: Compare all timeframes.
STEP 6: Detect timeframe conflicts (e.g., 4H/1H Bearish but 5M Bullish).
STEP 7: Only produce BUY/SELL when the evidence supports the signal across timeframes.
STEP 8: Otherwise return WAIT / NO_TRADE.

AUTOMATIC STRATEGY SELECTION
1. First identify the Market Regime (e.g., TRENDING, SIDEWAYS, BREAKOUT, REVERSAL, HIGH_VOLATILITY, LOW_VOLATILITY, CHOPPY, UNCLEAR).
2. Determine Strategy Compatibility based on the regime:
   - TRENDING -> Prefer Trend Following, Price Action
   - BREAKOUT -> Prefer Breakout, Support/Resistance
   - SIDEWAYS -> Prefer Mean Reversion, Support/Resistance
   - REVERSAL -> Prefer Reversal, Price Action
   - CHOPPY/UNCLEAR -> Prefer WAIT
3. If strategies conflict strongly, reduce confidence and prefer WAIT.
4. Calculate strategy relevance, evidence strength, and consensus.

If any higher timeframe images are MISSING, you must clearly acknowledge that the timeframe evidence is unavailable. Lower your data confidence and readiness appropriately rather than inventing the missing analysis.

For the primary 5M frames (ordered oldest → newest), evaluate:
- trend direction and changes
- market structure evolution
- momentum strengthening/weakening
- candle progression
- breakouts and failed breakouts
- pullbacks and continuations
- rejection and reversal behavior
- indicator progression
- support/resistance interaction
- choppiness or loss of structure

Do not treat the mere presence of multiple frames as evidence of higher confidence.
Evidence must come from meaningful market changes across the sequence.

==================================================
BULL VS BEAR CHECK
==================================================
Before selecting a signal, explicitly evaluate:
BULLISH EVIDENCE:
- strongest visible reasons for upside continuation/reversal

BEARISH EVIDENCE:
- strongest visible reasons for downside continuation/reversal

Then decide whether one side clearly dominates.
If the evidence is balanced or contradictory, prefer WAIT/UNSURE/NO_TRADE.

==================================================
PREVIOUS ANALYSIS COMPARISON
==================================================
When previous analysis exists:
- confirm whether the previous thesis is strengthening
- weakening
- invalidated
- reversing
- developing
- continuing
- unclear

Progressive history can contain both background 20-frame summaries and completed manual analyses.
Entries with source=manual are prior user-requested conclusions and must be treated as explicit comparison points.
Do not blindly preserve the previous signal.
The current frame sequence has authority over stale assumptions.

==================================================
SIGNAL QUALITY
==================================================
Use a conservative quality assessment:
EXCELLENT / GOOD / FAIR / POOR / AVOID

STRONG_BUY or STRONG_SELL should be used only when:
- multiple independent evidence groups align,
- higher timeframe context does not materially conflict,
- recent progression supports the direction,
- opposing evidence is limited,
- and the setup is appropriate for the requested trade duration.

If any of these conditions materially fail, downgrade the decision.

==================================================
PROGRESSIVE MODE
==================================================
${req.isProgressive ? "This is progressive background observation. Preserve an accurate market-state summary and do not manufacture a strong trade signal merely to create activity. WAIT is valid." : "This is a user-requested analysis. Produce the best current decision from all evidence."}

==================================================
FINAL RESPONSE
==================================================
- confidence, evidenceScore, and dataConfidence MUST be an integer percentage from 0 to 100 (e.g., 85, 95). DO NOT use a 1-5 rating scale.
Return ONLY valid JSON matching UniversalAIResponse.
` + responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode);
}

function responseSchema(timeframe: string, symbol: string, platform: string, mode: string): string {
  return `
{
  "trend": "Bullish | Bearish | Sideways",
  "signal": "${SIGNALS}",
  "confidence": 0, // MUST be an integer from 0 to 100 representing a percentage
  "readiness": "NOT READY | FAIR | GOOD | VERY GOOD | READY | READY / COMPLETE | EXCELLENT",
  "estimatedConfidence": "LOW | MEDIUM | HIGH",
  "recommendedTimeframe": "${timeframe}",
  "requiredTimeframe": null,
  "requestedIndicators": [],
  "entryPrice": null,
  "stopLoss": null,
  "takeProfit": null,
  "marketState": "Concise current market state.",
  "changesFromPrevious": "How the latest evidence differs from previous analysis.",
  "momentum": "Concise momentum assessment.",
  "candlestickBehavior": "Concise recent candle behavior.",
  "indicatorState": {},
  "strategyConsensus": "Bullish | Bearish | Neutral | Mixed",
  "strategyConflicts": [],
  "evidenceScore": 0, // MUST be an integer from 0 to 100 representing a percentage
  "signalQuality": "EXCELLENT | GOOD | FAIR | POOR | AVOID",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "invalidationConditions": [],
  "confirmationStatus": "CONFIRMED | DEVELOPING | WEAKENING | INVALIDATED | REVERSING | UNCLEAR",
  "explanation": "Concise user-facing explanation of the decision and strongest evidence.",
  "reasoning": "Concise structured reasoning summary; do not expose private chain-of-thought.",
  "detectedSymbol": "${symbol}",
  "detectedTimeframe": "${timeframe}",
  "exchange": "${platform}",
  "marketProvider": "${mode}",
  "riskDecision": "APPROVED | UNSURE | REJECTED",
  "dataConfidence": 0, // MUST be an integer from 0 to 100 representing a percentage
  "unifiedMarketData": {
    "symbol": "${symbol}",
    "timeframe": "${timeframe}",
    "accountData": {
      "balance": { "value": null, "source": "visual" },
      "equity": { "value": null, "source": "visual" },
      "margin": { "value": null, "source": "visual" },
      "leverage": { "value": null, "source": "visual" },
      "positions": { "value": [], "source": "visual" },
      "orderHistory": { "value": [], "source": "visual" },
      "tradeLogs": { "value": [], "source": "visual" }
    },
    "marketData": {
      "currentPrice": { "value": null, "source": "visual", "confidence": 0 },
      "bidAskSpread": { "value": null, "source": "visual" },
      "orderBookDepth": { "value": null, "source": "visual" },
      "volume": { "value": null, "source": "visual", "confidence": 0 }
    },
    "historicalData": {
      "completedCandle": { "value": null, "source": "visual", "confidence": 0 },
      "currentIncompleteCandle": { "value": null, "source": "visual", "confidence": 0 },
      "supportLevels": { "value": [], "source": "visual", "confidence": 0 },
      "resistanceLevels": { "value": [], "source": "visual", "confidence": 0 },
      "indicators": {}
    },
    "orderExecution": {
      "orderStatus": { "value": null, "source": "visual" },
      "executionPrice": { "value": null, "source": "visual" },
      "filledQuantities": { "value": null, "source": "visual" },
      "transactionIds": { "value": null, "source": "visual" },
      "fees": { "value": null, "source": "visual" }
    },
    "referenceData": {
      "lotSizes": { "value": null, "source": "visual" },
      "tickSizes": { "value": null, "source": "visual" },
      "marginRequirements": { "value": null, "source": "visual" },
      "tradingHours": { "value": null, "source": "visual" }
    },
    "marketStructure": { "value": null, "source": "visual", "confidence": 0 },
    "trend": { "value": null, "source": "visual", "confidence": 0 },
    "momentum": { "value": null, "source": "visual", "confidence": 0 },
    "tradingSession": { "value": null, "source": "visual", "confidence": 0 },
    "dataConflict": false,
    "conflictDetails": ""
  }
}

IMPORTANT UNIFIED DATA INSTRUCTIONS:
- For 'unifiedMarketData', NEVER hallucinate data. If you cannot clearly read exact numbers (like price or volume) from the visual chart, set "value": null.
- Always set "source": "visual" for values you extract from the image.
- Distinguish between a 'completedCandle' and the 'currentIncompleteCandle'.
`;
}

