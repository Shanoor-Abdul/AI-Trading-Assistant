import type { UniversalAIRequest } from "./schema";

export function buildApiDataPrompt(req: UniversalAIRequest): string {
  const market = req.marketData || {};
  return `You are an expert AI Trading Assistant.

You are provided with real-time algorithmic market data from the exchange (CCXT API).
Do NOT expect or request visual chart screenshots. Analyze the raw numerical data provided below.

SYMBOL: ${req.symbol}
TIMEFRAME: ${req.primaryTimeframe}
PLATFORM: ${req.platform}

MARKET DATA:
${JSON.stringify(market, null, 2)}

INSTRUCTIONS:
1. Identify the current trend (Bullish, Bearish, Sideways).
2. Determine if there is a clear trade signal (BUY, SELL, WAIT, etc.).
3. Calculate an entry price, stop loss, and take profit based on the data.
4. Output your detailed reasoning.
5. Conform to the strict JSON response schema.
6. CRITICAL: Set \`source: "api"\` for all data points.
7. Format indicators inside unifiedMarketData like this:
   "RSI": { "value": 62.4, "state": "Bullish", "source": "api" }
   "MACD": { "macd": 125, "signal": 110, "histogram": 15, "state": "Bullish", "source": "api" }
   "BollingerBands": { "upper": 1060, "middle": 1040, "lower": 1030, "position": "ABOVE_MIDDLE", "state": "Bullish", "source": "api" }
   "ATR": { "value": 850, "state": "NORMAL", "source": "api" }

Return only valid JSON.`;
}
