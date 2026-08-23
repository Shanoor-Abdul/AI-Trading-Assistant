import { UniversalAIRequest } from "./schema";

/**
 * Mobile-web-only vision analysis prompt.
 *
 * IMPORTANT: This prompt is intentionally independent from the desktop
 * visual-only progressive flow and the API-data flow.
 */
export function buildMobileAnalysisPrompt(req: UniversalAIRequest): string {
  const strategies = req.selectedStrategies?.length
    ? req.selectedStrategies.join(", ")
    : "Auto (AI Selection)";
  const indicators = req.visibleIndicators?.length
    ? req.visibleIndicators.join(", ")
    : "Detect all clearly visible standard indicators";

  return `
You are the dedicated MOBILE CHART ANALYSIS AI.

This request belongs ONLY to the mobile-web analysis pipeline.
Do not use, reference, or assume any desktop visual-only progressive analysis,
progressive-analyze API, API-data analysis, previous AI result, or stored frame history.
Analyze ONLY the single chart screenshot supplied with this request plus the user settings below.

USER SETTINGS
- Platform: ${req.platform || "Unknown"}
- Symbol / Currency / Asset: ${req.symbol || "Unknown"}
- Chart timeframe: ${req.primaryTimeframe || "Unknown"}
- Trade duration: ${req.tradeDuration || "Unknown"}
- Selected strategies: ${strategies}
- Requested/visible indicators: ${indicators}

MANDATORY ANALYSIS PIPELINE
1. IMAGE VALIDATION
2. RAW CHART EXTRACTION
3. PRICE/CANDLE EXTRACTION
4. INDICATOR VALUE EXTRACTION
5. MARKET STRUCTURE AND MOMENTUM
6. STRATEGY APPLICATION
7. BULLISH/BEARISH EVIDENCE
8. CONFIRMATION / CONFLICT CHECK
9. FINAL SIGNAL

SINGLE-IMAGE RULE
- This is exactly ONE screenshot.
- Do not invent Frame 1/Frame 2/Frame 3/etc.
- Do not perform temporal comparison with unavailable images.
- Do not use previous AI output as evidence.
- Do not infer missing historical values from assumptions.

EXTRACTION RULES
- Extract every value that is genuinely readable in the screenshot.
- For an exact numeric value that is not visibly readable, use null.
- NEVER estimate an exact RSI, MACD, ATR, EMA, Bollinger value, price, OHLC value,
  support/resistance level, or other number merely from a line's visual position.
- Qualitative evidence is allowed when numeric data is unavailable.
- Example: RSI value=null with state="RISING" is valid when the RSI line is clearly rising
  but the numeric value is not displayed.
- If an indicator is not visible, set visible=false, value=null where applicable,
  state="UNKNOWN", and confidence=0.
- If an indicator is visible but only its qualitative behavior is readable,
  describe that behavior and give an appropriate confidence.
- Never invent an indicator that is not visible.

INDICATORS
For each requested/visible indicator, extract as much as the screenshot supports:
- RSI: exact value if displayed; otherwise state/direction/zone if visually reliable.
- MACD: MACD line, signal line, histogram when readable; crossover and histogram direction.
- Bollinger Bands: upper/middle/lower values when readable; price position relative to bands.
- ATR: exact value only if displayed; otherwise volatility state if visually reliable.
- EMA/SMA: exact values only when displayed; otherwise relative price/MA relationship.
- Volume: value and direction only when visible/readable.
- Stochastic/VWAP/other indicators: same strict numeric rule.

PRICE AND MARKET STRUCTURE
Extract when readable:
- current/last price
- visible OHLC/candle information
- candle direction and behavior
- swing highs/lows
- support/resistance
- breakout/rejection behavior
- trend direction
- momentum
- market regime

STRATEGY RULES
Apply the selected strategies to the extracted evidence.
Do NOT select a signal because one indicator says Bullish/Bearish.
Do NOT use simple majority voting such as "3 indicators bullish = BUY".
Evaluate confluence between:
- price action
- market structure
- momentum
- indicators
- support/resistance
- selected strategy rules

SIGNAL RULES
- BUY/STRONG_BUY only when the extracted evidence provides a defensible bullish setup.
- SELL/STRONG_SELL only when the extracted evidence provides a defensible bearish setup.
- WAIT when evidence conflicts, setup quality is weak, or entry confirmation is missing.
- UNSURE when the screenshot is insufficient to make a reliable directional assessment.
- Confidence must represent evidence quality, not certainty of future price movement.
- WAIT can still have medium/high analytical confidence when the evidence clearly shows
  that confirmation is missing.
- Never manufacture a trade just because the user requested a signal.

RISK / PRICE LEVELS
- entryPrice, stopLoss, and takeProfit must be null when the screenshot does not support
  a defensible level.
- Never invent precise levels.
- If levels are clearly visible, explain the evidence supporting them.

OUTPUT REQUIREMENTS
Return ONLY valid JSON. No markdown. No code fences. No commentary outside JSON.
Populate actual observations from the supplied screenshot.
Do not copy placeholder/default values from this instruction.

The JSON MUST follow this structure and remain compatible with the existing UniversalAIResponse schema:
{
  "trend": "Bullish | Bearish | Sideways",
  "signal": "STRONG_BUY | BUY | WAIT | UNSURE | NO_TRADE | SELL | STRONG_SELL",
  "confidence": 0,
  "readiness": "NOT READY | FAIR | GOOD | VERY GOOD | READY | READY / COMPLETE | EXCELLENT",
  "estimatedConfidence": "LOW | MEDIUM | HIGH",
  "recommendedTimeframe": "${req.tradeDuration || req.primaryTimeframe || ""}",
  "entryPrice": null,
  "stopLoss": null,
  "takeProfit": null,
  "explanation": "Evidence-based explanation",
  "requestedIndicators": ${JSON.stringify(req.visibleIndicators || [])},
  "requiredTimeframe": null,
  "detectedSymbol": ${JSON.stringify(req.symbol || null)},
  "detectedTimeframe": ${JSON.stringify(req.primaryTimeframe || null)},
  "exchange": null,
  "marketProvider": "visual_only",
  "riskDecision": "UNSURE",
  "reasoning": "Detailed evidence-based reasoning",
  "dataConfidence": 0,
  "marketState": "Observed market state",
  "momentum": "Observed momentum",
  "candlestickBehavior": "Observed candle behavior",
  "indicatorState": {},
  "strategyConsensus": "Strategy conclusion",
  "strategyConflicts": [],
  "evidenceScore": 0,
  "signalQuality": "EXCELLENT | GOOD | FAIR | POOR | AVOID",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "invalidationConditions": [],
  "confirmationStatus": "CONFIRMED | DEVELOPING | WEAKENING | INVALIDATED | REVERSING | UNCLEAR",
  "unifiedMarketData": {
    "symbol": ${JSON.stringify(req.symbol || "")},
    "timeframe": ${JSON.stringify(req.primaryTimeframe || "")},
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
    "swingHigh": { "value": null, "source": "visual", "confidence": 0 },
    "swingLow": { "value": null, "source": "visual", "confidence": 0 },
    "breakoutLevel": { "value": null, "source": "visual", "confidence": 0 },
    "invalidationLevel": { "value": null, "source": "visual", "confidence": 0 },
    "dataConflict": false,
    "conflictDetails": "",
    "frameObservations": [],
    "temporalState": {
      "previousTrend": "",
      "currentDirection": "",
      "transition": "NONE",
      "regime": "UNCLEAR",
      "staleEvidence": [],
      "currentEvidence": [],
      "conflicts": [],
      "confirmationStatus": "UNCLEAR"
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
`;
}
