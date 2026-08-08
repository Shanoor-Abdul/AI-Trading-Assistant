export type StrategyType = "Scalping" | "DayTrading" | "Swing" | "SMC";

export interface StrategyContext {
  strategy: StrategyType;
  rules: string;
}

export class StrategyEngine {
  static getStrategyRules(strategy: StrategyType): StrategyContext {
    let rules = "";
    
    switch (strategy) {
      case "Scalping":
        rules = `
- Focus strictly on the 5m and 1m charts.
- Look for quick momentum scalps (1:1 or 1:1.5 RR).
- Highly sensitive to volume spikes and minor support/resistance.
- Do not hold trades through major news events.
`;
        break;
      case "DayTrading":
        rules = `
- Focus on the 15m and 1h charts.
- Identify the intraday trend and trade pullbacks.
- Minimum RR should be 1:2.
- Trades should be closed by end of day.
`;
        break;
      case "Swing":
        rules = `
- Focus on the 4h and Daily charts.
- Identify macro support/resistance and major regime changes.
- Minimum RR should be 1:3.
- Ignore minor intraday noise.
`;
        break;
      case "SMC":
        rules = `
- Focus on Order Blocks, Fair Value Gaps (FVG), and Liquidity Sweeps.
- Wait for a Change of Character (ChoCh) or Break of Structure (BOS) before entering.
- Target major liquidity pools for Take Profit.
`;
        break;
      default:
        rules = "- Standard hybrid analysis combining SMC and technical indicators.";
    }

    return {
      strategy,
      rules: rules.trim()
    };
  }
}
