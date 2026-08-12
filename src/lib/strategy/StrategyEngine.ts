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
  static getStrategyRules(strategy: StrategyType, platform?: string, tradeDuration?: string, marketDataMode?: string): StrategyContext {
    let rules = "";
    
    switch (strategy) {
      case "Scalping":
        rules = `
- Focus strictly on the 5m and 1m charts.
- Look for quick momentum scalps.
- Take profit at the nearest minor support/resistance.
- Do not hold trades through major news events.
- Stop loss must be extremely tight.
${marketDataMode === 'visual_only' ? '- Focus on visually identifiable short-term momentum, candle structure, and visible indicators (like MACD, Bollinger Bands) for breakouts and rejection.' : ''}
`;
        break;
      case "Trend Following":
        rules = `
- Identify the dominant trend on the chart.
- Strictly trade in the direction of that trend.
- Enter on pullbacks to dynamic support/resistance (like moving averages).
- Avoid trading in sideways, choppy markets.
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
${marketDataMode === 'visual_only' ? '- Focus ONLY on visually identifiable liquidity, BOS, CHoCH, displacement, FVG, and Order Blocks. DO NOT fabricate SMC structures.' : ''}
`;
        break;
      case "ICT":
        rules = `
- Utilize the ICT concepts: Judas Swing, Silver Bullet hours, and Killzones.
- Look for liquidity sweeps during London or NY open.
- Identify Market Structure Shifts (MSS) leaving behind an FVG.
- Enter on the return to the FVG (the "Unicorn" setup).
${marketDataMode === 'visual_only' ? '- Focus ONLY on visually identifiable ICT concepts from the screenshot. DO NOT fabricate them.' : ''}
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

    if (marketDataMode === 'visual_only' || tradeDuration) {
      rules += `\n
CRITICAL PLATFORM RULE (Fixed-Time / Binary Options):
- The user is trading on ${platform || 'a visual-only platform'} with a trade duration of ${tradeDuration || 'a few minutes'}.
- You are trading Fixed-Time options where you only need to predict if the price will be HIGHER or LOWER at the end of the duration.
- DO NOT wait for macro trends or perfect setups. If there is clear short-term momentum or a high-probability candlestick reversal on the current chart, YOU MUST issue a BUY or SELL signal.
- Be decisive. Do not be overly conservative.`;
    }

    return {
      strategy,
      rules: rules.trim()
    };
  }
}
