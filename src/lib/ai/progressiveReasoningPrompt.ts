import { UniversalAIRequest } from "./schema";

export function buildProgressiveReasoningPrompt(req: UniversalAIRequest): string {
  const strategies = req.selectedStrategies?.length ? req.selectedStrategies.join(", ") : "None specified";
  const history = req.progressiveState?.length ? JSON.stringify(req.progressiveState, null, 2) : "None";
  const previous = req.previousAnalysis ? JSON.stringify(req.previousAnalysis, null, 2) : "None";

  return `You are a PROGRESSIVE TRADING REASONING ENGINE.

You are performing Stage 2 analysis. Stage 1 (Vision Extraction) has already extracted visual market evidence from exactly 5 chronological chart frames (Frame 1 to Frame 5, representing a 5-minute trade progression).

Do NOT analyze images. Analyze ONLY the extracted structured JSON evidence provided below.

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
PREVIOUS AI ANALYSIS: ${previous}

EXTRACTED FRAME EVIDENCE (FRAME 1 -> FRAME 5):
${history}

==================================================
1. TEMPORAL COMPARISON (MULTI-FRAME)
==================================================
Review the provided Frame Evidence carefully.
Compare actual extracted evidence across all 5 frames sequentially (Frame 1 -> Frame 5).
Detect evolution in:
- Price direction
- Trend evolution
- Momentum evolution
- Indicator evolution (e.g. RSI 45 -> 50 -> 55)
- Support/resistance interaction

Explicitly log what actually changed across the 5 frames in the "changesFromPrevious" field. It represents the 5-frame evolution.
The "temporalState" object MUST also be populated by comparing Frame 1 to Frame 5.

==================================================
2. INDICATOR ANALYSIS & MARKET STRUCTURE
==================================================
Evaluate relationships between the extracted states of:
- RSI
- MACD
- Bollinger Bands
- ATR
- Price Action / Support / Resistance

If a frame extraction FAILED, explicitly acknowledge the missing data and do not treat it as neutral evidence.

==================================================
3. EVIDENCE, CONFLUENCE & STRATEGY
==================================================
Your final signal MUST strictly follow this logical pipeline:
Validation -> Temporal Comparison -> Indicator Analysis -> Market Structure / Price Action -> Evidence & Confluence -> Strategy -> Confirmation / Risk -> Final Signal.

Apply the USER SELECTED STRATEGY only after extracting and weighing the evidence and confluence.

MANDATORY RULE: Never treat a previous AI-generated trend/signal as evidence. Only raw frame observations and extracted market evidence may be used as evidence for the final analysis.

==================================================
4. CONFIDENCE, RISK & FINAL SIGNAL
==================================================
Possible Signals: BUY, SELL, WAIT, NO_TRADE, UNSURE.

WAIT is the correct answer if:
- Evidence is bearish but entry confirmation is missing.
- Evidence is conflicting or showing reversal.

WAIT does NOT automatically mean low confidence. If bearish evidence is strong but entry confirmation is missing, signal WAIT with medium/high analytical confidence.

Confidence must reflect the strength of the available extracted evidence across all frames.

==================================================
5. OUTPUT
==================================================

Return ONLY valid JSON matching this exact structure:

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
  "marketState": "Detailed description of the current market regime and conditions based on extracted evidence",
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
    "currentPrice": { "value": 12345.67, "source": "extracted", "confidence": 0.9 },
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
    "volume": { "value": null, "source": "extracted", "confidence": 0 },
    "bidAskSpread": { "value": null, "source": "extracted", "confidence": 0 },
    "supportLevels": { "value": [{ "value": 12000.0 }], "source": "extracted", "confidence": 0.8 },
    "resistanceLevels": { "value": [{ "value": 12500.0 }], "source": "extracted", "confidence": 0.8 },
    "indicators": {
      "RSI": { "value": 65.4, "state": "Overbought", "visible": true, "confidence": 0.9 },
      "MACD": { "value": 0.002, "histogram": 0.001, "state": "Bullish Crossover", "visible": true, "confidence": 0.9 },
      "Bollinger Bands": { "upper": 12400.0, "middle": 12300.0, "lower": 12200.0, "state": "Expanding", "visible": true, "confidence": 0.8 },
      "ATR": { "value": 15.2, "state": "High Volatility", "visible": true, "confidence": 0.8 }
    },
    "marketStructure": { "value": "Higher Highs", "source": "extracted", "confidence": 0.9 },
    "trend": { "value": "Bullish", "source": "extracted", "confidence": 0.9 },
    "momentum": { "value": "Strong", "source": "extracted", "confidence": 0.8 },
    "tradingSession": { "value": "New York", "source": "extracted", "confidence": 0.5 },
    "swingHigh": { "value": 12650.0, "source": "extracted", "confidence": 0.9 },
    "swingLow": { "value": 11950.0, "source": "extracted", "confidence": 0.9 },
    "breakoutLevel": { "value": 12550.0, "source": "extracted", "confidence": 0.7 },
    "invalidationLevel": { "value": 11850.0, "source": "extracted", "confidence": 0.8 },
    "dataConflict": false,
    "conflictDetails": "",
    "frameObservations": [],
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

IMPORTANT: You MUST populate the \`frameObservations\` array in the output with the 5 exact JSON objects provided in the EXTRACTED FRAME EVIDENCE above. Do not discard them.
`;
}
