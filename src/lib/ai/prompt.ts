export function buildTradingPrompt(
  symbol: string,
  timeframe: string,
  marketData?: any
) {
  let marketContext = "";
  if (marketData) {
    marketContext = `
Exact Market Data (DO NOT ESTIMATE, USE THESE VALUES):
Symbol: ${marketData.symbol}
Timeframe: ${marketData.timeframe}
Current Price: ${marketData.currentPrice}

Technical Indicators:
- EMA 20: ${marketData.indicators.ema20?.toFixed(4) || "N/A"}
- EMA 50: ${marketData.indicators.ema50?.toFixed(4) || "N/A"}
- EMA 200: ${marketData.indicators.ema200?.toFixed(4) || "N/A"}
- RSI (14): ${marketData.indicators.rsi?.toFixed(2) || "N/A"}
- MACD: ${marketData.indicators.macd?.MACD?.toFixed(4) || "N/A"}
- ATR: ${marketData.indicators.atr?.toFixed(4) || "N/A"}
- VWAP: ${marketData.indicators.vwap?.toFixed(4) || "N/A"}
- Bollinger Bands (20,2): Upper ${marketData.indicators.bb?.upper?.toFixed(4) || "N/A"}, Middle ${marketData.indicators.bb?.middle?.toFixed(4) || "N/A"}, Lower ${marketData.indicators.bb?.lower?.toFixed(4) || "N/A"}
`;
  }

  return `
You are an Expert Institutional Trader.

Analyze the trading chart image for visual patterns (candlesticks, support/resistance, trendlines, order blocks, liquidity, fair value gaps, market structure).

${marketContext}

Combine the visual patterns from the image with the exact market data provided above. 
DO NOT estimate OHLC values from the screenshot if exact data is provided.

Analyze:
• Trend
• Support/Resistance
• Candlestick Pattern
• Momentum & Volume
• Breakout / Fake Breakout
• Liquidity & Market Structure

Strict Confidence Rules:
- If Confidence >= 85, you may output BUY or SELL.
- If Confidence is between 60 and 84, you MUST output WAIT (market needs confirmation).
- If Confidence < 60, you MUST output UNSURE.

If a clear pattern exists and confidence is high, return BUY or SELL.
If confidence is moderate, return WAIT.
If the pattern is ambiguous or you are not sure because the current timeframe is too noisy, return the signal as "UNSURE". In the explanation, ask the user to provide a specific different timeframe chart (e.g., "Please provide the 15m or 1h chart for clarity.").

Never guess.

Return ONLY JSON.

{
  "trend":"Bullish | Bearish | Sideways",
  "signal":"BUY | SELL | WAIT | UNSURE",
  "confidence":90,
  "recommendedTimeframe":"5m",

  "entryPrice":0,
  "stopLoss":0,
  "takeProfit":0,
  
  "open": ${marketData?.ohlcv?.[marketData.ohlcv.length - 1]?.open || 0},
  "high": ${marketData?.ohlcv?.[marketData.ohlcv.length - 1]?.high || 0},
  "low": ${marketData?.ohlcv?.[marketData.ohlcv.length - 1]?.low || 0},
  "close": ${marketData?.currentPrice || 0},

  "explanation":"Provide a detailed explanation. E.g. 'Price bounced from 200 EMA, RSI recovering, MACD crossed bullish.' If UNSURE, ask for 1h/15m chart here.",
  
  "detectedSymbol": "${symbol}",
  "detectedTimeframe": "${timeframe}"
}
`;
}