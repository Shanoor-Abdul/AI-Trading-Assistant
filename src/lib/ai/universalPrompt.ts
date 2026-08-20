import { UniversalAIRequest } from "./schema";

const SIGNALS = "STRONG_BUY | BUY | WAIT | UNSURE | NO_TRADE | SELL | STRONG_SELL";

export function buildUniversalPrompt(req: UniversalAIRequest): string {
  const strategies = req.selectedStrategies?.length ? req.selectedStrategies.join(", ") : "Auto / not specified";
  const indicators = req.visibleIndicators?.length ? req.visibleIndicators.join(", ") : "Use only indicators actually visible";
  const historyState = req.partialBatch ? [...(req.progressiveState || []), req.partialBatch] : (req.progressiveState || []);
  const history = historyState.length ? JSON.stringify(historyState, null, 2) : "None";
  const previous = req.previousAnalysis ? JSON.stringify(req.previousAnalysis, null, 2) : "None";

  const base = `
You are an evidence-first trading analysis system. Your job is to convert chart evidence into structured market state and conservative trade decisions.

NON-NEGOTIABLE RULES
1. Never invent a price, OHLC value, indicator value, volume value, support/resistance level, order-book value, or account value that is not actually visible or supplied.
2. Use null for unreadable exact values.
3. Treat chronological frames as a TIME SERIES, not unrelated screenshots.
4. Distinguish the broader trend from the current short-term direction. They can disagree.
5. The newest completed candle and the newest current/incomplete candle have higher decision relevance than stale observations, but history remains context.
6. A direction change is NOT automatically a breakout or confirmed reversal. Require structural and independent confirmation.
7. Separate evidence groups. Multiple sentences saying the same thing are one evidence group, not multiple confirmations.
8. Explicitly evaluate bullish evidence AND bearish evidence before selecting BUY/SELL.
9. If evidence is mixed, transitional, stale, incomplete, or contradictory, prefer WAIT/UNSURE/NO_TRADE.
10. Confidence is evidence quality, NOT probability of winning.
11. Never force a trade because the user requested a signal.
12. Do not expose private chain-of-thought. Return concise structured evidence and conclusions only.

SESSION
Platform: ${req.platform}
Symbol: ${req.symbol}
Primary timeframe: ${req.primaryTimeframe}
Confirmation timeframe: ${req.confirmationTimeframe || "N/A"}
Trend timeframe: ${req.trendTimeframe || "N/A"}
Trade duration: ${req.tradeDuration || "N/A"}
Selected strategies: ${strategies}
Visible indicators: ${indicators}
Previous analysis: ${previous}
Progressive history: ${history}
`;

  if (req.mode === "api_data") {
    return `${base}

TEXT/JSON REASONING MODE
The input is already extracted structured market evidence. Do NOT request or infer missing screenshots. Do NOT perform another vision pass.

TEMPORAL REASONING
- Give the newest partial/current state the highest relevance.
- Use completed batches as historical context.
- Detect CONTINUATION, PULLBACK, RECOVERY, REVERSAL_DEVELOPING, REVERSAL_CONFIRMED, BREAKOUT, FALSE_BREAKOUT, RANGE, and CHOPPY where evidence supports them.
- A prior bearish trend plus current bullish momentum is a TRANSITION/RECOVERY unless the current structure is independently confirmed.
- Do not let five stale bearish summaries automatically outweigh a well-supported current bullish reversal.
- Conversely, one green candle must not automatically override a persistent bearish structure.

INDEPENDENT EVIDENCE GROUPS
Evaluate separately: market structure, candle behavior, momentum, indicators, support/resistance, volatility, volume, and multi-timeframe alignment. Count each category at most once for confirmation.

REGIME
First identify the current regime: TRENDING_UP, TRENDING_DOWN, RANGING, BREAKOUT, REVERSAL, or UNCLEAR. Select a compatible strategy. Choppy/unclear conditions should normally produce WAIT.

SIGNAL GATE
BUY/SELL requires current directional evidence, at least three independent supporting groups, meaningful separation from opposing evidence, and no unresolved reversal/pullback conflict. Strong signals require broader confirmation and very limited opposing evidence. If concrete entry/SL/TP levels are unavailable, keep them null.

CURRENT DATA
${JSON.stringify(req.marketData || {}, null, 2)}

Return ONLY valid JSON matching UniversalAIResponse.
${responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode)}`;
  }

  const hasImages = Boolean(req.screenshot || req.screenshots?.length || req.primaryTimeframePayload?.screenshots?.length);
  const chronological = req.screenshots && req.screenshots.length > 1;

  return `${base}

VISUAL ${chronological ? "CHRONOLOGICAL SEQUENCE" : "SINGLE FRAME"} MODE
${hasImages ? "Chart image evidence is attached." : "No image was attached."}

FRAME-BY-FRAME EXTRACTION — MANDATORY FOR PROGRESSIVE ANALYSIS
When multiple chronological images are supplied, create one frame observation for EVERY supplied frame, in exact input order. Never collapse 20 frames into one generic sentence.

For EACH frame extract only what is visibly supported:
- frameIndex
- timestamp if supplied
- price/current price if readable
- completed vs incomplete candle
- candle direction/body/wicks/pattern when visible
- broader trend and short-term direction separately
- market structure: HH/HL/LH/LL, break of structure, rejection, recovery, continuation when visible
- momentum direction and change
- each visible indicator's direction/state/value when readable
- support/resistance interaction when visible
- volatility/expansion/contraction when visible
- current market regime if supported
- bullish evidence groups
- bearish evidence groups
- confidence for the observation

TEMPORAL COMPARISON — MANDATORY
After frame observations, compare the sequence:
1. What was the prior trend?
2. What changed in the latest frames?
3. Is the latest movement continuation, pullback, recovery, reversal, breakout, false breakout, range, or chop?
4. Is the current direction confirmed or only developing?
5. Which evidence groups changed?
6. Which old evidence is stale?
7. What invalidates the current thesis?

IMPORTANT CURRENT-FRAME RULE
The latest completed candle is more important than old candles for entry timing. A current incomplete candle is useful for momentum/context but MUST NOT be treated as a confirmed completed candle.

REVERSAL RULE
Example: previous trend BEARISH + recent green candles + improving MACD + bounce from lower Bollinger Band = BULLISH RECOVERY / REVERSAL DEVELOPING unless structure and independent confirmation prove a reversal. Do not output an automatic BUY from that alone.

MULTI-TIMEFRAME RULE
If higher timeframe images exist, evaluate them hierarchically: higher timeframe bias → confirmation timeframe → primary timeframe → current candle. A lower-timeframe countertrend move can be a pullback rather than a reversal. If MTF data is missing, acknowledge that limitation.

STRATEGY RULE
TRENDING_UP/DOWN → Trend Following / Momentum.
BREAKOUT → Breakout / Support-Resistance.
RANGING → Mean Reversion / Support-Resistance.
REVERSAL → Reversal / Price Action.
CHOPPY/UNCLEAR → Wait.
Selected strategies are constraints/preferences, not permission to force a signal.

PROGRESSIVE MODE
${req.isProgressive ? "This is background progressive observation. Preserve precise state and evidence; do not manufacture a trade signal just because a frame is available." : "This is a user-requested analysis. Use the complete evidence set and return the best current decision."}

Return ONLY valid JSON matching UniversalAIResponse.
${responseSchema(req.primaryTimeframe, req.symbol, req.platform, req.mode)}`;
}

function responseSchema(timeframe: string, symbol: string, platform: string, mode: string): string {
  return `
{
  "trend": "Bullish | Bearish | Sideways",
  "signal": "${SIGNALS}",
  "confidence": 0,
  "readiness": "NOT READY | FAIR | GOOD | VERY GOOD | READY | READY / COMPLETE | EXCELLENT",
  "estimatedConfidence": "LOW | MEDIUM | HIGH",
  "recommendedTimeframe": "${timeframe}",
  "requiredTimeframe": null,
  "requestedIndicators": [],
  "entryPrice": null,
  "stopLoss": null,
  "takeProfit": null,
  "marketState": "Concise current market state.",
  "changesFromPrevious": "Current evidence versus prior state.",
  "momentum": "Concise momentum assessment.",
  "candlestickBehavior": "Concise latest candle behavior.",
  "indicatorState": {},
  "strategyConsensus": "Bullish | Bearish | Neutral | Mixed",
  "strategyConflicts": [],
  "evidenceScore": 0,
  "signalQuality": "EXCELLENT | GOOD | FAIR | POOR | AVOID",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "invalidationConditions": [],
  "confirmationStatus": "CONFIRMED | DEVELOPING | WEAKENING | INVALIDATED | REVERSING | UNCLEAR",
  "explanation": "Concise decision explanation.",
  "reasoning": "Concise structured reasoning summary; no private chain-of-thought.",
  "detectedSymbol": "${symbol}",
  "detectedTimeframe": "${timeframe}",
  "exchange": "${platform}",
  "marketProvider": "${mode}",
  "riskDecision": "APPROVED | UNSURE | REJECTED",
  "dataConfidence": 0,
  "riskReward": null,
  "unifiedMarketData": {
    "symbol": "${symbol}",
    "timeframe": "${timeframe}",
    "currentPrice": { "value": null, "source": "visual", "confidence": 0 },
    "completedCandle": { "value": null, "source": "visual", "confidence": 0 },
    "currentIncompleteCandle": { "value": null, "source": "visual", "confidence": 0 },
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
    "conflictDetails": "",
    "frameObservations": [
      {
        "frameIndex": 1,
        "timestamp": null,
        "isPartial": false,
        "price": null,
        "completedCandle": null,
        "currentIncompleteCandle": null,
        "trend": "Bullish | Bearish | Sideways",
        "shortTermDirection": "Bullish | Bearish | Neutral",
        "structure": "",
        "momentum": "",
        "indicators": {},
        "levels": { "supportLevels": [], "resistanceLevels": [], "supportInteraction": "", "resistanceInteraction": "" },
        "marketRegime": "TRENDING_UP | TRENDING_DOWN | RANGING | BREAKOUT | REVERSAL | UNCLEAR",
        "bullishEvidenceGroups": [],
        "bearishEvidenceGroups": [],
        "invalidation": [],
        "confidence": 0
      }
    ],
    "temporalState": {
      "previousTrend": "",
      "currentDirection": "",
      "transition": "NONE | CONTINUATION | PULLBACK | RECOVERY | REVERSAL_DEVELOPING | REVERSAL_CONFIRMED | BREAKOUT | FALSE_BREAKOUT | RANGE | CHOPPY",
      "regime": "TRENDING_UP | TRENDING_DOWN | RANGING | BREAKOUT | REVERSAL | UNCLEAR",
      "staleEvidence": [],
      "currentEvidence": [],
      "conflicts": [],
      "confirmationStatus": "CONFIRMED | DEVELOPING | WEAKENING | INVALIDATED | REVERSING | UNCLEAR"
    },
    "evidenceGroups": {
      "structure": [],
      "candle": [],
      "momentum": [],
      "indicators": [],
      "supportResistance": [],
      "volatility": [],
      "volume": [],
      "mtf": []
    }
  }
}

UNIFIED DATA REQUIREMENTS
- NEVER hallucinate exact numbers. Unreadable values MUST be null.
- source MUST be visual for image-derived values, api for supplied API values, hybrid only when both independently support the value.
- completedCandle and currentIncompleteCandle MUST remain separate.
- frameObservations MUST preserve chronological order.
- Every frame must have an observation when multiple images are supplied.
- The newest frame must be represented explicitly so downstream local reasoning can prioritize it.
`;
}
