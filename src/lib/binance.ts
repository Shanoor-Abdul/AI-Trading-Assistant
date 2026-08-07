import { EMA, RSI, MACD, ATR, BollingerBands, VWAP } from "technicalindicators";

export interface BinanceKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface MarketData {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  ohlcv: BinanceKline[]; // last 100 candles
  indicators: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    rsi: number | null;
    macd: { MACD?: number; signal?: number; histogram?: number } | null;
    atr: number | null;
    bb: { lower?: number; middle?: number; upper?: number } | null;
    vwap: number | null;
  };
}

export async function fetchBinanceData(symbol: string, timeframe: string): Promise<MarketData> {
  // Normalize symbol (e.g. BTC/USDT to BTCUSDT)
  const normalizedSymbol = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  
  // Normalize timeframe (Binance accepts 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M)
  let normalizedTimeframe = timeframe.toLowerCase();
  if (!["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"].includes(normalizedTimeframe)) {
    normalizedTimeframe = "5m"; // fallback
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${normalizedSymbol}&interval=${normalizedTimeframe}&limit=200`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  const klines: BinanceKline[] = data.map((d: any) => ({
    openTime: d[0],
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
    closeTime: d[6],
  }));

  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const volumes = klines.map(k => k.volume);

  // Calculate indicators
  const ema20Arr = EMA.calculate({ period: 20, values: closes });
  const ema50Arr = EMA.calculate({ period: 50, values: closes });
  const ema200Arr = EMA.calculate({ period: 200, values: closes });
  
  const rsiArr = RSI.calculate({ period: 14, values: closes });
  
  const macdArr = MACD.calculate({ 
    fastPeriod: 12, 
    slowPeriod: 26, 
    signalPeriod: 9, 
    SimpleMAOscillator: false, 
    SimpleMASignal: false, 
    values: closes 
  });
  
  const atrArr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  
  const bbArr = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  
  const vwapArr = VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes });

  const currentPrice = closes[closes.length - 1];

  return {
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
    currentPrice,
    ohlcv: klines.slice(-100), // Only return last 100 for context limit
    indicators: {
      ema20: ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : null,
      ema50: ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : null,
      ema200: ema200Arr.length > 0 ? ema200Arr[ema200Arr.length - 1] : null,
      rsi: rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : null,
      macd: macdArr.length > 0 ? macdArr[macdArr.length - 1] : null,
      atr: atrArr.length > 0 ? atrArr[atrArr.length - 1] : null,
      bb: bbArr.length > 0 ? bbArr[bbArr.length - 1] : null,
      vwap: vwapArr.length > 0 ? vwapArr[vwapArr.length - 1] : null,
    }
  };
}
