export function buildTradingPrompt(
  symbol: string,
  timeframe: string,
  marketData?: any,
  strategyRules?: string,
  visibleIndicators?: string[]
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
  let dataInstruction = "";
  if (marketData) {
    dataInstruction = `
Structured market data is available and should be prioritized for numerical analysis.
Analyze the provided exact market data for RSI, EMAs, price, trends, and market regime.
Since you are in API Data Mode, NO screenshot is provided. Base your analysis STRICTLY on the numerical values and technical indicators provided in the text.
`;
  } else {
    dataInstruction = `
No structured API market data is available. You are in VISUAL ONLY mode.
Analyze the uploaded screenshot. DO NOT expect CCXT, Exchange API, OHLCV, or programmatic indicators.
The user has confirmed that the following indicators/strategies are visible on the chart:
${visibleIndicators && visibleIndicators.length > 0 ? visibleIndicators.join(", ") : "None specified"}

Analyze whatever is actually visible (candlesticks, support/resistance, trendlines, and the specified indicators).
Never invent an indicator value. If an indicator is not visible, it is simply 'not_visible'.

If you cannot confidently analyze the chart, or you require additional indicators for confirmation, you MUST return 'UNSURE' and provide a "requestedIndicators" array and a "reason".
Example:
"signal": "UNSURE",
"confidence": 50,
"requestedIndicators": ["RSI"],
"reason": "The current chart shows MACD, but momentum confirmation is unclear. RSI would help confirm whether the current move is overextended."
`;
  }

  return `
You are an Expert Institutional Trader.

${marketData ? "Analyze the provided technical market data and indicators." : "Analyze the trading chart image for visual patterns (candlesticks, support/resistance, trendlines, order blocks, liquidity, fair value gaps, market structure)."}

${marketContext}

Analysis Rule:
${dataInstruction}

${strategyRules ? `Strategy Rules:\n${strategyRules}\n` : ""}
Analyze:
• Trend & Market Regime alignment
• Candlestick Patterns
• Momentum & Volume
• Liquidity & Subjective Market Structure

Strict Confidence Rules:
${marketData 
  ? `- If Confidence >= 85, you may output BUY or SELL.
- If Confidence is between 60 and 84, you MUST output WAIT (market needs confirmation).`
  : `- If Confidence >= 60, you may output BUY or SELL (Visual-Only Mode has a lower threshold, be decisive).
- If Confidence is between 40 and 59, you MUST output WAIT.`}
- If the market is completely choppy and unreadable, output NO_TRADE.
- If Confidence < 40, you MUST output UNSURE.

Return ONLY JSON.

{
  "trend":"Bullish | Bearish | Sideways",
  "signal":"BUY | SELL | WAIT | UNSURE",
  "confidence":90,
  "recommendedTimeframe":"5m",
  "requiredTimeframe": "optional string e.g. 15m if needed",
  "requestedIndicators": ["optional", "array", "of", "indicators"],

  "entryPrice":0,
  "stopLoss":0,
  "takeProfit":0,
  
  "open": ${marketData?.recentCandles?.[marketData.recentCandles.length - 1]?.open || "null"},
  "high": ${marketData?.recentCandles?.[marketData.recentCandles.length - 1]?.high || "null"},
  "low": ${marketData?.recentCandles?.[marketData.recentCandles.length - 1]?.low || "null"},
  "close": ${marketData?.lastPrice || "null"},

  "explanation":"${marketData ? "Provide a detailed explanation of your trade idea based entirely on the programmatic indicators and regime." : "Provide a detailed explanation of your visual analysis or reason for being UNSURE."}",
  "reason":"Explain why you are UNSURE if signal is UNSURE.",
  
  "detectedSymbol": "${symbol}",
  "detectedTimeframe": "${timeframe}"
}
`;
}