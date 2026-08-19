import type { UniversalAIRequest } from "./schema";

export function buildFastTextSignalPrompt(req: UniversalAIRequest): string {
  const progressive = Array.isArray(req.progressiveState) ? req.progressiveState.slice(-3) : [];
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
- Compare bullish and bearish evidence.
- Require multiple independent confirmations for BUY/SELL.
- If evidence conflicts, is stale, or is insufficient, return WAIT.
- Never invent prices, indicators, volume, support/resistance, or market structure.
- Prefer the newest evidence over stale conclusions.
- For a fixed-time trade, judge direction for the requested duration, but still return WAIT when evidence is weak.

Return ONLY compact JSON:
{"trend":"Bullish|Bearish|Sideways","signal":"BUY|SELL|WAIT|UNSURE|NO_TRADE","confidence":0,"dataConfidence":0,"signalQuality":"GOOD|FAIR|POOR|AVOID","readiness":"READY|GOOD|FAIR|NOT READY","strategyConsensus":"Bullish|Bearish|Neutral|Mixed","marketState":"","momentum":"","bullishEvidence":[],"bearishEvidence":[],"invalidationConditions":[],"explanation":""}
`;
}
