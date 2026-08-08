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

export class StrategyEngine {
  static getStrategyRules(strategy: StrategyType): StrategyContext {
    let rules = "";
    
    switch (strategy) {
      case "Scalping":
        rules = `
- Focus strictly on the 5m and 1m charts.
- Look for quick momentum scalps.
- Take profit at the nearest minor support/resistance.
- Do not hold trades through major news events.
- Stop loss must be extremely tight.
`;
        break;
      case "Trend Following":
        rules = `
- Focus on the 15m, 1h, and 4h charts.
- Identify the macro trend and strictly trade in the direction of that trend.
- Enter on pullbacks (higher lows in an uptrend, lower highs in a downtrend).
- Ride the trend until market structure breaks.
`;
        break;
      case "Breakout":
        rules = `
- Identify major consolidation zones or chart patterns (triangles, flags).
- Wait for a strong volume breakout candle.
- Enter on the breakout or the retest of the broken level.
- Set stop loss just inside the consolidation zone.
`;
        break;
      case "Mean Reversion":
        rules = `
- Identify price extremes using RSI, Bollinger Bands, or significant deviation from moving averages.
- Wait for a reversal candlestick pattern (pin bar, engulfing) at the extreme.
- Target the mean (e.g. the 20 EMA or center of the range).
`;
        break;
      case "SMC":
        rules = `
- Focus on Order Blocks, Fair Value Gaps (FVG), and Liquidity Sweeps.
- Wait for a Change of Character (ChoCh) or Break of Structure (BOS) before entering.
- Target major liquidity pools (equal highs/lows) for Take Profit.
- Stop loss tightly behind the defining Order Block.
`;
        break;
      case "ICT":
        rules = `
- Utilize the ICT concepts: Judas Swing, Silver Bullet hours, and Killzones.
- Look for liquidity sweeps during London or NY open.
- Identify Market Structure Shifts (MSS) leaving behind an FVG.
- Enter on the return to the FVG (the "Unicorn" setup).
`;
        break;
      case "Swing":
        rules = `
- Focus on the 4h and Daily charts.
- Identify macro support/resistance and major regime changes.
- Ignore minor intraday noise. Hold for days or weeks.
`;
        break;
      case "Custom":
        rules = `
- Use generic technical analysis combining price action, support/resistance, and volume.
- Focus on high probability setups with strong confluence.
`;
        break;
      default:
        rules = "- Standard hybrid analysis combining price action and technical indicators.";
    }

    return {
      strategy,
      rules: rules.trim()
    };
  }
}
