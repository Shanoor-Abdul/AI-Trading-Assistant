export type StrategyType =
  | "Scalping"
  | "Trend Following"
  | "Breakout"
  | "Mean Reversion"
  | "SMC"
  | "ICT"
  | "Custom"
  | "Swing";

export interface StrategyContext {
  strategy: StrategyType;
  rules: string;
}

const FIXED_TIME_PLATFORMS = new Set([
  "olymptrade",
  "binomo",
  "quotex",
  "pocketoption",
  "pocket option",
]);

export class StrategyEngine {
  static getStrategyRules(strategy: StrategyType, platform?: string, tradeDuration?: string, marketDataMode?: string): StrategyContext {
    let rules = "";

    switch (strategy) {
      case "Scalping":
        rules = `
- Focus on the primary entry timeframe and one confirmation timeframe.
- Require momentum and structure alignment before entry.
- Prefer pullbacks/retests over chasing extended candles.
- Avoid choppy conditions and weak liquidity.
${marketDataMode === "visual_only" ? "- Use only visually identifiable momentum, candle structure, and visible indicators; never invent exact values." : ""}
`;
        break;
      case "Trend Following":
        rules = `
- Identify the dominant trend on the higher timeframe.
- Trade in the direction of the confirmed trend.
- Prefer pullbacks/retests to dynamic support/resistance.
- Avoid sideways/choppy markets unless a confirmed breakout establishes a new regime.
`;
        break;
      case "Breakout":
        rules = `
- Identify a well-defined consolidation/range.
- Require a decisive breakout and preferably a retest/acceptance.
- Volume confirmation is required when reliable volume data is available; never invent volume.
- Reject failed breakouts and wick-only breaks.
`;
        break;
      case "Mean Reversion":
        rules = `
- Use only in a confirmed range/sideways regime.
- Look for price extremes at established support/resistance.
- Require reversal confirmation rather than buying/selling the first touch.
- Do not use mean reversion against a strong established trend without a confirmed regime change.
`;
        break;
      case "SMC":
        rules = `
- Focus on visually or numerically supported BOS, CHoCH, liquidity sweeps, FVG and order-block evidence.
- Require a structural confirmation before entry.
- Never fabricate an SMC structure that is not supported by the supplied data.
`;
        break;
      case "ICT":
        rules = `
- Use ICT concepts only when the required market structure, liquidity and session evidence is actually available.
- Require a market-structure shift plus a valid setup before entry.
- Never fabricate killzones, liquidity sweeps, FVGs or other ICT structures.
`;
        break;
      case "Swing":
        rules = `
- Focus on higher-timeframe structure and major support/resistance.
- Ignore minor intraday noise.
- Require a clear macro regime and sufficient room to target before entry.
`;
        break;
      case "Custom":
        rules = `
- Combine price action, support/resistance and available technical evidence.
- Require multiple independent confirmations.
- Prefer WAIT when evidence is conflicting or incomplete.
`;
        break;
      default:
        rules = "- Use evidence-driven price action, support/resistance, momentum and indicator confluence.";
    }

    const normalizedPlatform = (platform || "").trim().toLowerCase();
    const isFixedTime = FIXED_TIME_PLATFORMS.has(normalizedPlatform);

    if (isFixedTime) {
      rules += `

FIXED-TIME PLATFORM RULES:
- The trade horizon is ${tradeDuration || "short-term"}.
- Judge the directional probability at the end of the fixed duration.
- Do not invent an entry/SL/TP structure if the platform does not use it.
- Still require confluence and allow WAIT when evidence is insufficient.
`;
    } else {
      rules += `

STANDARD INTRADAY RULES:
- A chart timeframe is not the same thing as a forced trade duration.
- Use the higher timeframe for context, the confirmation timeframe for structure, and the entry timeframe for timing.
- Define entry, invalidation, and target when the data supports them.
- Do not force BUY/SELL simply because a new candle appeared.
- WAIT is preferred when the setup is incomplete or conflicting.
`;
    }

    return {
      strategy,
      rules: rules.trim(),
    };
  }
}
