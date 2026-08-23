import { UniversalAIRequest } from "./schema";

const SIGNALS = "STRONG_BUY | BUY | WAIT | UNSURE | NO_TRADE | SELL | STRONG_SELL";

export function buildUniversalPrompt(req: UniversalAIRequest): string {
  const strategies = req.selectedStrategies?.length ? req.selectedStrategies.join(", ") : "None specified";
  const indicators = req.visibleIndicators?.length ? req.visibleIndicators.join(", ") : "None specified";
  const history = req.progressiveState?.length ? JSON.stringify(req.progressiveState, null, 2) : "None";
  const previous = req.previousAnalysis ? JSON.stringify(req.previousAnalysis, null, 2) : "None";
  const primaryFrames = req.primaryTimeframePayload?.screenshots?.length || req.screenshots?.length || 0;
  const mtf = [
    `4H Macro Trend Image: ${req.macroTimeframe ? "AVAILABLE" : "MISSING"}`,
    `1H Confirmation Image: ${req.confirmationTimeframeImage ? "AVAILABLE" : "MISSING"}`,
    `15M Structure Image: ${req.structureTimeframe ? "AVAILABLE" : "MISSING"}`,
    `5M Primary Frames: ${primaryFrames}`,
  ].join("\n");

  return `You are the Visual Market Evidence and Trading Signal Analyst.

STRICTLY FOLLOW THIS PIPELINE:

EXTRACT → VERIFY → COMPARE → APPLY STRATEGY → CONFLUENCE → RISK → SIGNAL.
==================================================
1. FRAME EXTRACTION & VALIDATION
==================================================

Progressive analysis receives exactly 5 chronological frames for a 5-minute trade: one frame per minute.
Analyze EVERY supplied chart frame independently.

For every frame, extract detailed visual evidence and indicator states.
NEVER just output a simple label like "Bullish" or "Bearish".

Extract when visible:

PRICE:
- current price
- open/high/low/close if visible
- direction

CANDLE BEHAVIOR:
- body size/direction
- wicks (rejection/engulfing)

TREND & STRUCTURE:
- current trend
- swing highs/lows
- structure breaks

INDICATORS (MANDATORY EXTRACTION):
For RSI, MACD, Bollinger Bands, and ATR:
- Extract exact numerical value if visibly displayed.
- The model MUST NOT infer or invent an exact numeric indicator value from a line position. If the numeric value is not visibly displayed: value = null.
- Even when numeric value is unavailable, allow qualitative visual evidence (e.g., RSI visually rising, MACD bearish, Bollinger price near lower band).
- If indicator state is not reliably observable, state: UNKNOWN (Do not invent Neutral or Bullish).

SUPPORT / RESISTANCE:
- identifiable levels
- interaction (holding/breaking)

VOLUME:
- visible spikes/divergences

==================================================
2. MISSING VALUES & CONFIDENCE
==================================================

- If a numeric value cannot be clearly read, return null. 
- If an indicator is not readable, confidence: 0 is correct.
- If price/candles are clearly visible, those can have positive confidence.
- Throwing away information via "UNKNOWN" or 0 confidence is forbidden ONLY IF the chart clearly provides evidence.

==================================================
3. FRAME OBSERVATIONS
==================================================

Create one structured observation for EVERY frame.
Do not skip frames. You must output exactly 5 objects inside the frameObservations array.

==================================================
4. TEMPORAL COMPARISON (MULTI-FRAME)
==================================================

Compare actual extracted evidence across all 5 frames sequentially:
Frame 1 -> Frame 2 -> Frame 3 -> Frame 4 -> Frame 5

Temporal analysis must use ACTUAL extracted evidence, not just labels.
Compare:
- Frame 1 RSI state/value -> Frame 5 RSI state/value
- Frame 1 MACD -> Frame 5 MACD
- Candle and Price structure evolution

Explicitly log what actually changed across the 5 frames in the "changesFromPrevious" field. It represents the 5-frame evolution, not just the previous API request.
The "temporalState" object MUST also be populated by comparing Frame 1 to Frame 5.

==================================================
5. INDICATOR ANALYSIS & MARKET STRUCTURE
==================================================

Evaluate relationships between the states of:
- RSI
- MACD
- Bollinger Bands
- ATR
- Price Action / Support / Resistance

==================================================
6. EVIDENCE, CONFLUENCE & STRATEGY
==================================================

Your final signal MUST strictly follow this logical pipeline:
Frame Extraction -> Validation -> Temporal Comparison -> Indicator Analysis -> Market Structure / Price Action -> Evidence & Confluence -> Strategy -> Confirmation / Risk -> Final Signal.

Apply the USER SELECTED STRATEGY only after extracting and weighing the evidence and confluence.

MANDATORY RULE: Never treat a previous AI-generated trend/signal as evidence. Only raw frame observations and extracted market evidence may be used as evidence for the final analysis.

==================================================
7. CONFIDENCE, RISK & FINAL SIGNAL
==================================================

Possible Signals: BUY, SELL, WAIT, NO_TRADE, UNSURE.

WAIT is the correct answer if:
- Evidence is bearish but entry confirmation is missing.
- Evidence is conflicting or showing reversal.

WAIT does NOT automatically mean low confidence. If bearish evidence is strong but entry confirmation is missing, signal WAIT with medium/high analytical confidence.

Confidence must reflect the strength of the available extracted evidence.

==================================================
CONTEXT & REQUIREMENTS
==================================================
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

==================================================
10. OUTPUT
==================================================

Return ONLY valid JSON.

IMPORTANT RULES FOR THE JSON:
1. THIS IS STRICTLY AN EXAMPLE OF THE EXPECTED STRUCTURE. 
2. YOU MUST REPLACE EVERY SINGLE EXAMPLE NUMBER (e.g., 12345.67, 65.4) AND STRING WITH THE GENUINE, ACTUAL VALUES EXTRACTED FROM THE PROVIDED IMAGES. 
3. IF A NUMBER CANNOT BE SEEN, RETURN null. IF TEXT CANNOT BE DETERMINED, RETURN AN EMPTY STRING "".
4. NEVER COPY THE EXAMPLE VALUES. NEVER INVENT VALUES.

The response MUST contain EXACTLY this structure (do not deviate, missing string values MUST be an empty string "" (NOT null), missing number values should be null, arrays should be empty [] if unknown). Place frameObservations, temporalState, evidenceGroups, and strategyAnalysis inside unifiedMarketData so the frontend can read them.

{
  "trend": "Sideways",
  "signal": "WAIT",
  "confidence": 0,
  "readiness": "NOT READY",
  "estimatedConfidence": "LOW",
  "recommendedTimeframe": "${req.primaryTimeframe}",
  "requiredTimeframe": null,
  "requestedIndicators": ["RSI", "MACD", "Bollinger Bands", "ATR"],
  "entryPrice": 12345.67,
  "stopLoss": 12300.00,
  "takeProfit": 12400.00,
  "marketState": "Detailed description of the current market regime and conditions",
  "changesFromPrevious": "Summary of evolution from Frame 1 to Frame 5",
  "momentum": "UNKNOWN",
  "candlestickBehavior": "UNKNOWN",
  "indicatorState": {
    "RSI": "Overbought",
    "MACD": "Bullish Crossover"
  },
  "strategyConsensus": "Neutral",
  "strategyConflicts": [],
  "evidenceScore": 0,
  "signalQuality": "AVOID",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "invalidationConditions": [],
  "confirmationStatus": "UNCLEAR",
  "explanation": "Detailed explanation of the analysis and reasoning",
  "reasoning": "Step-by-step logical reasoning leading to the signal",
  "detectedSymbol": "${req.symbol}",
  "detectedTimeframe": "${req.primaryTimeframe}",
  "exchange": "${req.platform}",
  "marketProvider": "${req.mode}",
  "riskDecision": "UNSURE",
  "dataConfidence": 0,
  "unifiedMarketData": {
    "symbol": "${req.symbol}",
    "timeframe": "${req.primaryTimeframe}",
    "currentPrice": { "value": 12345.67, "source": "visual", "confidence": 0.9 },
    "completedCandle": {
      "open": 12300.0,
      "high": 12350.0,
      "low": 12290.0,
      "close": 12345.67,
      "direction": "Bullish"
    },
    "currentIncompleteCandle": {
      "open": 12345.67,
      "high": 12355.0,
      "low": 12340.0,
      "close": 12350.0,
      "direction": "Bullish"
    },
    "volume": { "value": 5000.5, "source": "visual", "confidence": 0.8 },
    "bidAskSpread": { "value": 0.5, "source": "visual", "confidence": 0.6 },
    "supportLevels": { "value": [{ "value": 12000.0 }, { "value": 11800.0 }], "source": "visual", "confidence": 0.8 },
    "resistanceLevels": { "value": [{ "value": 12500.0 }, { "value": 12600.0 }], "source": "visual", "confidence": 0.8 },
    "indicators": {
      "RSI": { "value": 65.4, "state": "Overbought", "visible": true, "confidence": 0.9 },
      "MACD": { "value": 0.002, "histogram": 0.001, "state": "Bullish Crossover", "visible": true, "confidence": 0.9 },
      "Bollinger Bands": { "upper": 12400.0, "middle": 12300.0, "lower": 12200.0, "state": "Expanding", "visible": true, "confidence": 0.8 },
      "ATR": { "value": 15.2, "state": "High Volatility", "visible": true, "confidence": 0.8 }
    },
    "marketStructure": { "value": "Higher Highs", "source": "visual", "confidence": 0.9 },
    "trend": { "value": "Bullish", "source": "visual", "confidence": 0.9 },
    "momentum": { "value": "Strong", "source": "visual", "confidence": 0.8 },
    "tradingSession": { "value": "New York", "source": "visual", "confidence": 0.5 },
    "swingHigh": { "value": 12650.0, "source": "visual", "confidence": 0.9 },
    "swingLow": { "value": 11950.0, "source": "visual", "confidence": 0.9 },
    "breakoutLevel": { "value": 12550.0, "source": "visual", "confidence": 0.7 },
    "invalidationLevel": { "value": 11850.0, "source": "visual", "confidence": 0.8 },
    "dataConflict": false,
    "conflictDetails": "",
    "frameObservations": [
      {
        "frameIndex": 1,
        "timestamp": "2024-01-01T12:00:00Z",
        "timeframe": "${req.primaryTimeframe}",
        "isPartial": false,
        "price": 12345.67,
        "completedCandle": {
          "open": 12300.0,
          "high": 12350.0,
          "low": 12290.0,
          "close": 12345.67,
          "direction": "Bullish"
        },
        "currentIncompleteCandle": {
          "open": 12345.67,
          "high": 12355.0,
          "low": 12340.0,
          "close": 12350.0,
          "direction": "Bullish"
        },
        "trend": "Bullish",
        "shortTermDirection": "Up",
        "structure": "Higher Highs",
        "momentum": "Strong Bullish",
        "candleBehavior": "Expanding bodies",
        "indicators": {
          "RSI": { "value": 65.4, "state": "Overbought", "visible": true, "confidence": 0.9 },
          "MACD": { "value": 0.002, "histogram": 0.001, "state": "Bullish Crossover", "visible": true, "confidence": 0.9 },
          "Bollinger Bands": { "upper": 12400.0, "middle": 12300.0, "lower": 12200.0, "state": "Expanding", "visible": true, "confidence": 0.8 },
          "ATR": { "value": 15.2, "state": "High Volatility", "visible": true, "confidence": 0.8 }
        },
        "levels": {
          "supportLevels": [{ "value": 12000.0 }],
          "resistanceLevels": [{ "value": 12500.0 }],
          "supportInteraction": "Bouncing",
          "resistanceInteraction": "Approaching",
          "breakoutLevel": 12550.0,
          "invalidationLevel": 11850.0
        },
        "swingHigh": 12650.0,
        "swingLow": 11950.0,
        "marketRegime": "UNCLEAR",
        "bullishEvidenceGroups": [],
        "bearishEvidenceGroups": [],
        "invalidation": [],
        "confidence": 0
      }
    ],
    "temporalState": { "previousTrend": "", "currentDirection": "", "transition": "NONE", "regime": "UNCLEAR", "staleEvidence": [], "currentEvidence": [], "conflicts": [], "confirmationStatus": "UNCLEAR" },
    "evidenceGroups": { "structure": [], "candle": [], "momentum": [], "indicators": [], "supportResistance": [], "volatility": [], "volume": [], "mtf": [] },
    "strategyAnalysis": {
      "strategy": "",
      "conditions": [],
      "satisfiedConditions": [],
      "failedConditions": [],
      "unknownConditions": [],
      "confluence": ""
    }
  }
}

FINAL RULE:

The signal MUST be derived from:

FRAME VALUES
→ VALUE CHANGES
→ INDICATOR RELATIONSHIPS
→ PRICE ACTION
→ MARKET STRUCTURE
→ STRATEGY CONDITIONS
→ CONFLUENCE
→ RISK
→ SIGNAL.

Never derive a trading signal from a simple frame label such as
"Bullish" or "Bearish".
`;
}
