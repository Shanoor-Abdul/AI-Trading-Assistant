import { UniversalAIRequest } from "./schema";

/**
 * Shared instruction for all AI providers so web and mobile use the same
 * target/stop-loss contract. For fixed-time trades these are analytical
 * reference levels, not broker order instructions.
 */
export function buildPriceLevelInstruction(req: UniversalAIRequest): string {
  return `

==================================================
REFERENCE ENTRY / TARGET / STOP-LOSS LEVELS
==================================================
The application displays Entry, Target (TP), and Stop Loss (SL) as analytical reference levels for the user's signal.
For fixed-time trading, these levels are NOT broker order instructions and do not replace the selected trade duration.

Trade duration: ${req.tradeDuration || "N/A"}
Chart timeframe: ${req.primaryTimeframe}

When the final signal is BUY, STRONG_BUY, SELL, or STRONG_SELL:
1. entryPrice MUST be the current/readable market price when it is clearly visible or available from exact API data. Never invent it.
2. takeProfit MUST be a logical reference target in the signal direction when a defensible level can be identified.
3. stopLoss MUST be a logical reference invalidation level when a defensible level can be identified.
4. Prefer visible/readable support, resistance, recent swing highs/lows, Bollinger Bands, and other selected indicator levels as the basis for TP/SL.
5. Use the trade duration as a consistency constraint: shorter durations should use nearer, realistic reference levels; longer durations can allow wider levels. Do NOT use an arbitrary percentage formula just to manufacture a value.
6. For BUY: takeProfit must be above entryPrice and stopLoss must be below entryPrice.
7. For SELL: takeProfit must be below entryPrice and stopLoss must be above entryPrice.
8. Do not return the same value for entry, TP, and SL.
9. Return numeric JSON values, not formatted currency strings.
10. If the current price or the required chart levels cannot be read/derived reliably, return null for the affected field instead of guessing.
11. For WAIT, UNSURE, or NO_TRADE, entryPrice, takeProfit, and stopLoss should normally be null unless an analytical reference level is clearly useful.

QUALITY RULE:
Never invent exact TP/SL prices. A defensible null is better than a fabricated level.
`;
}
