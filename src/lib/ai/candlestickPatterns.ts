export type CandlePatternDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

export type CandlePatternDefinition = {
  name: string;
  direction: CandlePatternDirection;
  candles: number;
  family: "single" | "two" | "three" | "multi";
  context: string;
  source?: "TA-Lib" | "common-reference";
};

/**
 * Canonical visual reference catalog for mobile screenshot extraction.
 *
 * The core catalog follows TA-Lib's 61 candlestick pattern-recognition
 * functions. Some TA-Lib functions contain bullish/bearish variants (for
 * example CDL3INSIDE, CDL3OUTSIDE and CDLRISEFALL3METHODS); the prompt tells
 * the vision model to resolve the visible directional variant rather than
 * inventing a direction.
 *
 * Important: these are recognition references, not guaranteed trade signals.
 * Pattern direction is only one evidence category and must be confirmed by
 * market structure, location, momentum and other extracted evidence.
 */
export const CANDLE_PATTERN_CATALOG: CandlePatternDefinition[] = [
  // Single-candle / primarily single-bar formations
  { name: "Doji", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "open and close are very close; indecision, context determines whether it matters" },
  { name: "Dragonfly Doji", direction: "BULLISH", candles: 1, family: "single", source: "TA-Lib", context: "very small body with long lower shadow and little/no upper shadow; stronger after decline or at support" },
  { name: "Gravestone Doji", direction: "BEARISH", candles: 1, family: "single", source: "TA-Lib", context: "very small body with long upper shadow and little/no lower shadow; stronger after advance or at resistance" },
  { name: "Long Legged Doji", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "small body with long upper and lower shadows; strong indecision" },
  { name: "Spinning Top", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "small body with meaningful upper and lower shadows; indecision" },
  { name: "High-Wave Candle", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "small body with unusually long shadows; high uncertainty" },
  { name: "Rickshaw Man", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "small body near the middle of a wide range with long shadows; indecision" },
  { name: "Hammer", direction: "BULLISH", candles: 1, family: "single", source: "TA-Lib", context: "small body near the top with long lower shadow; strongest after decline and near support" },
  { name: "Hanging Man", direction: "BEARISH", candles: 1, family: "single", source: "TA-Lib", context: "hammer-shaped candle after an advance; bearish warning requires confirmation" },
  { name: "Inverted Hammer", direction: "BULLISH", candles: 1, family: "single", source: "TA-Lib", context: "small body with long upper shadow after decline; requires confirmation" },
  { name: "Shooting Star", direction: "BEARISH", candles: 1, family: "single", source: "TA-Lib", context: "small body near the low with long upper shadow after advance or near resistance" },
  { name: "Marubozu", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "large real body with minimal shadows; direction follows visible candle color" },
  { name: "Closing Marubozu", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "open/high or open/low relationship leaves little shadow into the close; direction follows candle color" },
  { name: "Long Line Candle", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "unusually large real body; direction follows candle color" },
  { name: "Short Line Candle", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "unusually small real body; weak directional commitment" },
  { name: "Takuri", direction: "BULLISH", candles: 1, family: "single", source: "TA-Lib", context: "hammer/dragonfly-like candle with exceptionally long lower shadow; strongest after decline" },
  { name: "Belt-hold", direction: "NEUTRAL", candles: 1, family: "single", source: "TA-Lib", context: "strong opening with little/no shadow on the opening side; direction follows candle color and context" },

  // Two-candle formations
  { name: "Engulfing Pattern", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "second real body engulfs first; bullish or bearish variant must be resolved from visible candle colors and context" },
  { name: "Harami Pattern", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "small second body contained within prior large body; bullish or bearish variant follows candle colors" },
  { name: "Harami Cross Pattern", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "harami where the second candle is a doji; bullish or bearish variant follows context" },
  { name: "Piercing Pattern", direction: "BULLISH", candles: 2, family: "two", source: "TA-Lib", context: "bearish candle followed by bullish candle closing materially into the prior body, typically after decline" },
  { name: "Dark Cloud Cover", direction: "BEARISH", candles: 2, family: "two", source: "TA-Lib", context: "bullish candle followed by bearish candle closing materially into the prior body, typically after advance" },
  { name: "Doji Star", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "trend candle followed by a doji separated by a visible gap/relationship; direction depends on context" },
  { name: "Kicking", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "strong opposite-color marubozu candles separated by a meaningful gap; direction follows the second candle" },
  { name: "Kicking By Length", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "kicking classification where bullish/bearish direction is determined by the longer marubozu" },
  { name: "Counterattack", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "opposite-color candles with similar closes after a directional move; direction depends on preceding trend" },
  { name: "Matching Low", direction: "BULLISH", candles: 2, family: "two", source: "TA-Lib", context: "two bearish candles finish at approximately the same low, suggesting support after decline" },
  { name: "Homing Pigeon", direction: "BULLISH", candles: 2, family: "two", source: "TA-Lib", context: "small bearish candle contained within prior larger bearish candle after decline" },
  { name: "On-Neck Pattern", direction: "BEARISH", candles: 2, family: "two", source: "TA-Lib", context: "bearish continuation structure where the second candle closes near the prior low" },
  { name: "In-Neck Pattern", direction: "BEARISH", candles: 2, family: "two", source: "TA-Lib", context: "bearish continuation structure where the second candle closes slightly into the prior body" },
  { name: "Thrusting Pattern", direction: "BEARISH", candles: 2, family: "two", source: "TA-Lib", context: "bearish candle followed by bullish counter-move that fails to reach the prior body midpoint" },
  { name: "Separating Lines", direction: "NEUTRAL", candles: 2, family: "two", source: "TA-Lib", context: "opposite-color candles with matching opens; direction follows the prevailing trend and second candle" },

  // Three-candle formations
  { name: "Morning Star", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "bearish candle, small indecision/star candle, then strong bullish candle after decline" },
  { name: "Morning Doji Star", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "morning star with a doji middle candle; stronger when gaps/structure are visible" },
  { name: "Evening Star", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "bullish candle, small indecision/star candle, then strong bearish candle after advance" },
  { name: "Evening Doji Star", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "evening star with a doji middle candle; stronger when gaps/structure are visible" },
  { name: "Three Inside Up", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "bullish harami followed by bullish confirmation" },
  { name: "Three Inside Down", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "bearish harami followed by bearish confirmation" },
  { name: "Three Outside Up", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "bullish engulfing followed by bullish confirmation" },
  { name: "Three Outside Down", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "bearish engulfing followed by bearish confirmation" },
  { name: "Three White Soldiers", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "three consecutive strong bullish candles with progressively higher closes and controlled shadows" },
  { name: "Three Black Crows", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "three consecutive strong bearish candles with progressively lower closes and controlled shadows" },
  { name: "Identical Three Crows", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "three bearish candles with highly similar opening/closing structure; rare and requires clear geometry" },
  { name: "Three Stars In The South", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "rare three-candle bullish reversal structure after decline; all defining geometry must be visible" },
  { name: "Two Crows", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "bullish advance followed by two bearish candles forming a reversal/exhaustion structure" },
  { name: "Advance Block", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "bullish sequence with weakening bodies/shadows suggesting loss of momentum" },
  { name: "Stalled Pattern", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "bullish advance stalls with a small/indecisive final candle; bearish warning" },
  { name: "Stick Sandwich", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "bearish, bullish, bearish sequence with matching closes suggesting support" },
  { name: "Upside Gap Two Crows", direction: "BEARISH", candles: 3, family: "three", source: "TA-Lib", context: "advance with an upside gap followed by two bearish candles; exhaustion/reversal warning" },
  { name: "Tasuki Gap", direction: "NEUTRAL", candles: 3, family: "three", source: "TA-Lib", context: "two candles create a gap and third candle partially retraces it without fully closing; direction follows gap/trend" },
  { name: "Tristar Pattern", direction: "NEUTRAL", candles: 3, family: "three", source: "TA-Lib", context: "three doji-like candles; rare indecision/reversal structure requiring clear geometry" },
  { name: "Unique 3 River", direction: "BULLISH", candles: 3, family: "three", source: "TA-Lib", context: "rare bullish reversal formation after decline; requires full three-candle geometry" },

  // Four/five-candle and multi-candle formations
  { name: "Three-Line Strike", direction: "NEUTRAL", candles: 4, family: "multi", source: "TA-Lib", context: "three candles trend in one direction followed by a large opposite candle; direction/continuation interpretation depends on context" },
  { name: "Abandoned Baby", direction: "NEUTRAL", candles: 3, family: "three", source: "TA-Lib", context: "three-candle reversal with isolated doji and visible gaps; bullish or bearish variant follows direction" },
  { name: "Breakaway", direction: "NEUTRAL", candles: 5, family: "multi", source: "TA-Lib", context: "five-candle reversal/transition pattern involving a gap and progressive counter-move; direction follows visible structure" },
  { name: "Concealing Baby Swallow", direction: "BULLISH", candles: 4, family: "multi", source: "TA-Lib", context: "rare bullish reversal made from consecutive bearish marubozu-like candles with concealed final structure" },
  { name: "Ladder Bottom", direction: "BULLISH", candles: 5, family: "multi", source: "TA-Lib", context: "rare bullish reversal after decline; final bullish candle confirms the ladder structure" },
  { name: "Mat Hold", direction: "BULLISH", candles: 5, family: "multi", source: "TA-Lib", context: "strong trend candle followed by contained corrective candles and continuation; bearish mirror can occur in downtrend" },
  { name: "Rising Three Methods", direction: "BULLISH", candles: 5, family: "multi", source: "TA-Lib", context: "strong bullish candle, small corrective candles contained within its range, then bullish continuation" },
  { name: "Falling Three Methods", direction: "BEARISH", candles: 5, family: "multi", source: "TA-Lib", context: "strong bearish candle, small corrective candles contained within its range, then bearish continuation" },
  { name: "Hikkake Pattern", direction: "NEUTRAL", candles: 3, family: "multi", source: "TA-Lib", context: "inside-bar/false-break style setup; direction is determined only after the visible break and context" },
  { name: "Modified Hikkake Pattern", direction: "NEUTRAL", candles: 3, family: "multi", source: "TA-Lib", context: "modified hikkake structure; requires complete visible sequence and breakout context" },

  // Common references that complement the TA-Lib recognition catalog.
  { name: "Bullish Marubozu", direction: "BULLISH", candles: 1, family: "single", source: "common-reference", context: "large bullish body with little/no shadows; strong directional candle" },
  { name: "Bearish Marubozu", direction: "BEARISH", candles: 1, family: "single", source: "common-reference", context: "large bearish body with little/no shadows; strong directional candle" },
  { name: "Four-Price Doji", direction: "NEUTRAL", candles: 1, family: "single", source: "common-reference", context: "open, high, low and close are essentially the same; extremely rare/low-information candle" },
  { name: "Opening Marubozu", direction: "NEUTRAL", candles: 1, family: "single", source: "common-reference", context: "opening price equals the high or low with strong movement away from the open; direction follows candle color" },
  { name: "Inside Bar", direction: "NEUTRAL", candles: 2, family: "two", source: "common-reference", context: "second candle's high/low remains inside the prior candle's range; breakout direction must be observed rather than assumed" },
  { name: "Tweezer Top", direction: "BEARISH", candles: 2, family: "two", source: "common-reference", context: "two candles reject a similar high near resistance; stronger after advance" },
  { name: "Tweezer Bottom", direction: "BULLISH", candles: 2, family: "two", source: "common-reference", context: "two candles reject a similar low near support; stronger after decline" },
  { name: "Bullish Kicker", direction: "BULLISH", candles: 2, family: "two", source: "common-reference", context: "strong bullish gap/reversal structure; gap must actually be visible" },
  { name: "Bearish Kicker", direction: "BEARISH", candles: 2, family: "two", source: "common-reference", context: "strong bearish gap/reversal structure; gap must actually be visible" },
];

export const CANDLE_PATTERN_NAMES = CANDLE_PATTERN_CATALOG.map((pattern) => pattern.name);

export const CANDLE_PATTERN_REFERENCE_COUNT = CANDLE_PATTERN_CATALOG.length;

export const CANDLE_PATTERN_PROMPT_CATALOG = CANDLE_PATTERN_CATALOG
  .map((pattern) => `- ${pattern.name} | ${pattern.direction} | ${pattern.candles} candle${pattern.candles === 1 ? "" : "s"} | ${pattern.context}`)
  .join("\n");

export const CANDLE_PATTERN_REFERENCE_POLICY = `
REFERENCE POLICY:
1. The catalog is a recognition reference, not a prediction guarantee.
2. Prefer the exact named pattern only when the required OHLC geometry and candle sequence are visible.
3. If the geometry is incomplete or compressed, use a *_like observation instead of forcing a textbook name.
4. Gap-dependent patterns require a visible gap; never infer a gap from candle color alone.
5. Multi-candle patterns require every required candle in the sequence to be readable.
6. Resolve bullish/bearish variants from the actual visible candle colors and surrounding trend; never copy a direction blindly from the catalog.
7. A pattern by itself can never satisfy the mobile BUY/SELL gate. It is one evidence category in the confluence model.
8. Pattern recognition confidence is recognition quality, not probability of the next candle.
9. Rare patterns should receive lower confidence unless their defining geometry is exceptionally clear.
10. When multiple patterns overlap, return the best-supported candidate(s) rather than flooding the result with synonymous labels.
`;
