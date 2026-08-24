export type CandlePatternDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

export type CandlePatternDefinition = {
  name: string;
  direction: CandlePatternDirection;
  candles: number;
  family: "single" | "two" | "three" | "multi";
  context: string;
};

/**
 * Visual reference catalog used by the screenshot extraction prompt.
 * Direction is the conventional interpretation; the model must still verify
 * the actual candle geometry and surrounding price context before reporting a
 * pattern. A pattern is evidence, never an automatic trade signal.
 */
export const CANDLE_PATTERN_CATALOG: CandlePatternDefinition[] = [
  { name: "Doji", direction: "NEUTRAL", candles: 1, family: "single", context: "open and close are very close; context determines continuation/reversal" },
  { name: "Dragonfly Doji", direction: "BULLISH", candles: 1, family: "single", context: "very small body with long lower wick and little/no upper wick; stronger after decline/at support" },
  { name: "Gravestone Doji", direction: "BEARISH", candles: 1, family: "single", context: "very small body with long upper wick and little/no lower wick; stronger after rise/at resistance" },
  { name: "Long-Legged Doji", direction: "NEUTRAL", candles: 1, family: "single", context: "small body with long upper and lower wicks; signals indecision" },
  { name: "Hammer", direction: "BULLISH", candles: 1, family: "single", context: "small body with long lower wick; strongest after decline near support" },
  { name: "Inverted Hammer", direction: "BULLISH", candles: 1, family: "single", context: "small body with long upper wick; strongest after decline and needs confirmation" },
  { name: "Hanging Man", direction: "BEARISH", candles: 1, family: "single", context: "hammer-shaped candle after an advance; needs bearish confirmation" },
  { name: "Shooting Star", direction: "BEARISH", candles: 1, family: "single", context: "small body with long upper wick after an advance/near resistance" },
  { name: "Spinning Top", direction: "NEUTRAL", candles: 1, family: "single", context: "small body with meaningful upper and lower wicks" },
  { name: "Marubozu", direction: "CONTEXT", candles: 1, family: "single", context: "very large body with little wick; direction follows candle color and context" },
  { name: "Bullish Marubozu", direction: "BULLISH", candles: 1, family: "single", context: "large bullish body with minimal wicks" },
  { name: "Bearish Marubozu", direction: "BEARISH", candles: 1, family: "single", context: "large bearish body with minimal wicks" },
  { name: "Bullish Engulfing", direction: "BULLISH", candles: 2, family: "two", context: "bullish candle body engulfs prior bearish body, usually after decline" },
  { name: "Bearish Engulfing", direction: "BEARISH", candles: 2, family: "two", context: "bearish candle body engulfs prior bullish body, usually after advance" },
  { name: "Bullish Harami", direction: "BULLISH", candles: 2, family: "two", context: "small bullish body contained within prior large bearish body" },
  { name: "Bearish Harami", direction: "BEARISH", candles: 2, family: "two", context: "small bearish body contained within prior large bullish body" },
  { name: "Piercing Line", direction: "BULLISH", candles: 2, family: "two", context: "bearish candle followed by strong bullish candle closing above the midpoint of prior body" },
  { name: "Dark Cloud Cover", direction: "BEARISH", candles: 2, family: "two", context: "bullish candle followed by bearish candle closing below the midpoint of prior body" },
  { name: "Tweezer Bottom", direction: "BULLISH", candles: 2, family: "two", context: "two candles reject a similar low near support" },
  { name: "Tweezer Top", direction: "BEARISH", candles: 2, family: "two", context: "two candles reject a similar high near resistance" },
  { name: "Bullish Kicker", direction: "BULLISH", candles: 2, family: "two", context: "strong bullish reversal with a decisive gap/shift in candle direction when visible" },
  { name: "Bearish Kicker", direction: "BEARISH", candles: 2, family: "two", context: "strong bearish reversal with a decisive gap/shift in candle direction when visible" },
  { name: "Meeting Lines Bullish", direction: "BULLISH", candles: 2, family: "two", context: "opposite-color candles meet near the same closing price after decline" },
  { name: "Meeting Lines Bearish", direction: "BEARISH", candles: 2, family: "two", context: "opposite-color candles meet near the same closing price after advance" },
  { name: "Morning Star", direction: "BULLISH", candles: 3, family: "three", context: "bearish candle, small indecision candle, then strong bullish candle after decline" },
  { name: "Evening Star", direction: "BEARISH", candles: 3, family: "three", context: "bullish candle, small indecision candle, then strong bearish candle after advance" },
  { name: "Three White Soldiers", direction: "BULLISH", candles: 3, family: "three", context: "three consecutive strong bullish candles with sustained higher closes" },
  { name: "Three Black Crows", direction: "BEARISH", candles: 3, family: "three", context: "three consecutive strong bearish candles with sustained lower closes" },
  { name: "Three Inside Up", direction: "BULLISH", candles: 3, family: "three", context: "bullish harami followed by bullish confirmation" },
  { name: "Three Inside Down", direction: "BEARISH", candles: 3, family: "three", context: "bearish harami followed by bearish confirmation" },
  { name: "Three Outside Up", direction: "BULLISH", candles: 3, family: "three", context: "bullish engulfing followed by bullish confirmation" },
  { name: "Three Outside Down", direction: "BEARISH", candles: 3, family: "three", context: "bearish engulfing followed by bearish confirmation" },
  { name: "Bullish Abandoned Baby", direction: "BULLISH", candles: 3, family: "three", context: "bearish candle, isolated doji/indecision, then bullish candle; gap must be visible to call classic pattern" },
  { name: "Bearish Abandoned Baby", direction: "BEARISH", candles: 3, family: "three", context: "bullish candle, isolated doji/indecision, then bearish candle; gap must be visible to call classic pattern" },
  { name: "Bullish Tasuki Gap", direction: "BULLISH", candles: 3, family: "three", context: "bullish trend with gap and partial retracement that does not fully close the gap" },
  { name: "Bearish Tasuki Gap", direction: "BEARISH", candles: 3, family: "three", context: "bearish trend with gap and partial retracement that does not fully close the gap" },
  { name: "Rising Three Methods", direction: "BULLISH", candles: 5, family: "multi", context: "strong bullish candle, small corrective candles contained within it, then bullish continuation" },
  { name: "Falling Three Methods", direction: "BEARISH", candles: 5, family: "multi", context: "strong bearish candle, small corrective candles contained within it, then bearish continuation" },
  { name: "Three Line Strike Bullish", direction: "BULLISH", candles: 4, family: "multi", context: "three-candle bearish sequence followed by a large bullish candle reversing the prior bodies" },
  { name: "Three Line Strike Bearish", direction: "BEARISH", candles: 4, family: "multi", context: "three-candle bullish sequence followed by a large bearish candle reversing the prior bodies" },
  { name: "Tri-Star", direction: "NEUTRAL", candles: 3, family: "three", context: "three doji-like candles; rare and requires clear geometry" },
  { name: "Stick Sandwich", direction: "BULLISH", candles: 3, family: "three", context: "bearish, bullish, bearish sequence with matching closes forming support" },
  { name: "Upside Gap Two Crows", direction: "BEARISH", candles: 3, family: "three", context: "bullish advance followed by gap-up bearish candles showing exhaustion" },
  { name: "Advance Block", direction: "BEARISH", candles: 3, family: "three", context: "three bullish candles with weakening bodies/wicks suggesting momentum loss" },
  { name: "Deliberation", direction: "BEARISH", candles: 3, family: "three", context: "bullish sequence with a final small/indecisive candle suggesting exhaustion" },
  { name: "Unique Three River", direction: "BULLISH", candles: 3, family: "three", context: "rare three-candle bullish reversal structure after decline" },
  { name: "Matching Low", direction: "BULLISH", candles: 2, family: "two", context: "two bearish candles finish at nearly the same low, suggesting support" },
  { name: "Homing Pigeon", direction: "BULLISH", candles: 2, family: "two", context: "small bearish candle contained within prior large bearish body after decline" },
];

export const CANDLE_PATTERN_NAMES = CANDLE_PATTERN_CATALOG.map((pattern) => pattern.name);

export const CANDLE_PATTERN_PROMPT_CATALOG = CANDLE_PATTERN_CATALOG
  .map((pattern) => `- ${pattern.name} | ${pattern.direction} | ${pattern.candles} candle${pattern.candles === 1 ? "" : "s"} | ${pattern.context}`)
  .join("\n");
