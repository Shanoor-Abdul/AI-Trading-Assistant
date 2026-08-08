export function buildTradingPrompt(
  symbol: string,
  timeframe: string,
  marketData?: any,
  strategyRules?: string
) {
  let marketContext = "";
  if (marketData) {
    marketContext = `
Exact Market Data (DO NOT ESTIMATE, USE THESE VALUES):
Symbol: ${symbol}
Timeframe: ${timeframe}
Current Price: ${marketData.lastPrice}

Technical Indicators:
- EMA 20: ${marketData.indicators?.ema20?.toFixed(4) || "N/A"}
- EMA 50: ${marketData.indicators?.ema50?.toFixed(4) || "N/A"}
- RSI (14): ${marketData.indicators?.rsi?.toFixed(2) || "N/A"}
- MACD: ${marketData.indicators?.macd?.MACD?.toFixed(4) || "N/A"}
- ADX: ${marketData.indicators?.adx?.adx?.toFixed(2) || "N/A"}
- OBV: ${marketData.indicators?.obv || "N/A"}
- Volume SMA (20): ${marketData.indicators?.volumeSma?.toFixed(2) || "N/A"}

Programmatic Market Structure:
- Regime: ${marketData.marketRegime || "N/A"}
- Total Recent Swings (Support/Resistance potential): Highs: ${marketData.swings?.swingHighs?.length || 0}, Lows: ${marketData.swings?.swingLows?.length || 0}
${marketData.multiTimeframe ? `
Macro Multi-Timeframe Trends:
- 15m Regime: ${marketData.multiTimeframe['15m_regime'] || "N/A"}
- 1h Regime: ${marketData.multiTimeframe['1h_regime'] || "N/A"}
` : ""}
`;
  }

  return `
You are an Expert Institutional Trader.

Analyze the trading chart image for visual patterns (candlesticks, support/resistance, trendlines, order blocks, liquidity, fair value gaps, market structure).

${marketContext}

Hybrid Analysis Rule:
DO NOT estimate prices from the screenshot. ALWAYS use the provided exact market data for RSI, EMAs, price, trends, and market regime.
Use the screenshot ONLY for subjective visual pattern recognition that code cannot easily detect:
- Order Blocks
- Fair Value Gaps
- Liquidity Sweeps / Liquidity Zones
- Break of Structure / Change of Character
- Supply/Demand Zones
- Chart Drawings or user annotations.

${strategyRules ? `Strategy Rules:\n${strategyRules}\n` : ""}
Analyze:
• Trend & Market Regime alignment
• Candlestick Patterns
• Momentum & Volume
• Liquidity & Subjective Market Structure

Strict Confidence Rules:
- If Confidence >= 85, you may output BUY or SELL.
- If Confidence is between 60 and 84, you MUST output WAIT (market needs confirmation).
- If Confidence < 60, you MUST output UNSURE.

Return ONLY JSON.

{
  "trend":"Bullish | Bearish | Sideways",
  "signal":"BUY | SELL | WAIT | UNSURE",
  "confidence":90,
  "recommendedTimeframe":"5m",

  "entryPrice":0,
  "stopLoss":0,
  "takeProfit":0,
  
  "open": ${marketData?.recentCandles?.[marketData.recentCandles.length - 1]?.open || 0},
  "high": ${marketData?.recentCandles?.[marketData.recentCandles.length - 1]?.high || 0},
  "low": ${marketData?.recentCandles?.[marketData.recentCandles.length - 1]?.low || 0},
  "close": ${marketData?.lastPrice || 0},

  "explanation":"Provide a detailed explanation combining the programmatic indicators/regime with your visual SMC/Order Block analysis.",
  
  "detectedSymbol": "${symbol}",
  "detectedTimeframe": "${timeframe}"
}
`;
}