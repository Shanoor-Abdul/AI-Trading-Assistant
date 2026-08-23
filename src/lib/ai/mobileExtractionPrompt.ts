import { UniversalAIRequest } from "./schema";

/**
 * Mobile-web-only FIRST STAGE prompt.
 * This stage extracts evidence from exactly one screenshot and MUST NOT trade.
 */
export function buildMobileExtractionPrompt(req: UniversalAIRequest): string {
  const indicators = req.visibleIndicators?.length
    ? req.visibleIndicators.join(", ")
    : "all clearly visible standard indicators";

  return `
You are the MOBILE CHART EXTRACTION AI.

This is STAGE 1 of a two-stage mobile trading pipeline.
Your ONLY job is to inspect the supplied SINGLE screenshot and extract factual visual evidence.
DO NOT produce BUY, SELL, WAIT, UNSURE, a trading strategy, or a final signal.
DO NOT use previous AI output, stored history, or assumptions.

USER CONTEXT
- Platform: ${req.platform || "Unknown"}
- Symbol / Asset: ${req.symbol || "Unknown"}
- Chart timeframe: ${req.primaryTimeframe || "Unknown"}
- Trade duration: ${req.tradeDuration || "Unknown"}
- Requested indicators: ${indicators}

STRICT EXTRACTION RULES
1. Inspect the image itself. Extract every value that is genuinely readable.
2. NEVER invent an exact numeric value from line position, spacing, color, or visual estimation.
3. If an exact number is not visibly readable, use null for that numeric field.
4. Qualitative visual evidence MUST still be extracted when reliable.
5. If an indicator is not visible, set visible=false, numeric values=null, state="UNKNOWN", confidence=0.
6. If visible but numeric labels are unreadable, set numeric values=null and describe only what is visually defensible.
7. Extract current price, visible candles/OHLC, candle behavior, trend, momentum, market structure, swing highs/lows, support/resistance, breakout/rejection, and every requested visible indicator.
8. Never infer historical candles outside the supplied image.
9. Never calculate a value that requires data not present in the image.
10. Confidence is confidence in the extracted observation, NOT probability of a trade.
11. Do not leave visualEvidence empty when the chart visibly contains useful factual price/indicator observations.
12. Do not leave visibleIndicators empty when an indicator is visibly present. Record its name even when its numeric value is unreadable.
13. If the chart is readable, extractionConfidence must be greater than 0 and at least one factual observation must be populated.

INDICATORS
For RSI: value if displayed; otherwise null; also extract zone/direction/state.
For MACD: MACD line, signal line, histogram if readable; otherwise null; extract crossover/direction.
For Bollinger Bands: upper/middle/lower if readable; otherwise null; extract price position.
For ATR: value only if displayed; otherwise null; extract volatility state if visible.
For EMA/SMA/VWAP/Volume/Stochastic/other visible indicators: apply the same strict rules.

OUTPUT ONLY JSON. No markdown. No commentary.
The JSON must contain factual extraction only:

{
  "symbol": "${String(req.symbol || "")}",
  "timeframe": "${String(req.primaryTimeframe || "")}",
  "currentPrice": {"value": null, "confidence": 0},
  "candles": {
    "latest": {"open": null, "high": null, "low": null, "close": null, "complete": false},
    "behavior": "UNKNOWN",
    "confidence": 0
  },
  "trend": {"state": "UNKNOWN", "confidence": 0},
  "momentum": {"state": "UNKNOWN", "confidence": 0},
  "marketStructure": {"state": "UNKNOWN", "confidence": 0},
  "supportLevels": [],
  "resistanceLevels": [],
  "swingHigh": null,
  "swingLow": null,
  "breakoutLevel": null,
  "invalidationLevel": null,
  "indicators": {
    "RSI": {"value": null, "state": "UNKNOWN", "visible": false, "confidence": 0},
    "MACD": {"macd": null, "signal": null, "histogram": null, "state": "UNKNOWN", "visible": false, "confidence": 0},
    "Bollinger Bands": {"upper": null, "middle": null, "lower": null, "position": "UNKNOWN", "state": "UNKNOWN", "visible": false, "confidence": 0},
    "ATR": {"value": null, "state": "UNKNOWN", "visible": false, "confidence": 0}
  },
  "visibleIndicators": [],
  "visualEvidence": [],
  "extractionConfidence": 0
}
`;
}
