import type { UniversalAIRequest } from "./schema";

export function buildFastTextSignalPrompt(req: UniversalAIRequest): string {
  let progressive = Array.isArray(req.progressiveState) ? req.progressiveState.slice(-3) : [];
  if (req.partialBatch) {
    progressive = [...progressive, req.partialBatch];
  }
  const market = req.marketData || null;

  return `You are a low-latency trading signal classifier.

Use ONLY the supplied structured/text market evidence. Do not analyze images. Do not fetch external data. Do not write explanations longer than one sentence. Do not expose chain-of-thought.

SYMBOL: ${req.symbol}
TIMEFRAME: ${req.primaryTimeframe}
TRADE DURATION: ${req.tradeDuration || "N/A"}
PLATFORM: ${req.platform}

LATEST MARKET DATA:
${JSON.stringify(market)}

LATEST PROGRESSIVE OBSERVATIONS:
${JSON.stringify(progressive)}

DECISION RULES:
- Use Temporal Weighting: The newest batch (especially partialBatch) holds the highest weight for immediate price action.
- Evaluate Primary Trend vs Short-Term Direction to determine the Transition State (e.g., Bearish trend + Bullish Short-Term = RECOVERY).
- Require multiple independent confirmations (Structure, Momentum, Indicators) for a trade.
- If evidence conflicts (e.g. Trend vs Momentum), or is insufficient, return WAIT.
- Never invent prices, indicators, volume, support/resistance, or market structure.
- Prefer the newest evidence over stale conclusions for entry timing, but respect higher-timeframe trends.

Return ONLY compact JSON:
{"trend":"Bullish|Bearish|Sideways","primaryTrend":"Bullish|Bearish|Sideways","shortTermDirection":"Bullish|Bearish|Sideways","structureTransition":"CONTINUATION|PULLBACK|RECOVERY|REVERSAL_DEVELOPING|REVERSAL_CONFIRMED|BREAKOUT|FALSE_BREAKOUT|RANGE|CHOPPY","signal":"BUY|SELL|WAIT|UNSURE|NO_TRADE","confidence":0,"dataConfidence":0,"signalQuality":"GOOD|FAIR|POOR|AVOID","readiness":"READY|GOOD|FAIR|NOT READY","strategyConsensus":"Bullish|Bearish|Neutral|Mixed","marketState":"","momentum":"","bullishEvidence":[],"bearishEvidence":[],"invalidationConditions":[],"explanation":""}
`;
}
