import { OHLCV, Ticker } from '../providers/market/MarketProvider';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class MarketCache {
  private static ohlcvCache = new Map<string, CacheEntry<OHLCV[]>>();
  private static tickerCache = new Map<string, CacheEntry<Ticker>>();

  private static getTTLForTimeframe(timeframe: string): number {
    switch (timeframe) {
      case '1m': return 15 * 1000; // 15 seconds
      case '5m': return 30 * 1000; // 30 seconds
      case '15m': return 2 * 60 * 1000; // 2 minutes
      case '1h': return 5 * 60 * 1000; // 5 minutes
      case '4h': return 15 * 60 * 1000; // 15 minutes
      case '1d': return 60 * 60 * 1000; // 1 hour
      default: return 30 * 1000;
    }
  }

  static getOHLCV(exchange: string, symbol: string, timeframe: string): OHLCV[] | null {
    const key = `${exchange}:${symbol}:${timeframe}`;
    const entry = this.ohlcvCache.get(key);
    if (!entry) return null;

    const ttl = this.getTTLForTimeframe(timeframe);
    if (Date.now() - entry.timestamp > ttl) {
      this.ohlcvCache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  static setOHLCV(exchange: string, symbol: string, timeframe: string, data: OHLCV[]): void {
    const key = `${exchange}:${symbol}:${timeframe}`;
    this.ohlcvCache.set(key, { data, timestamp: Date.now() });
  }

  static getTicker(exchange: string, symbol: string): Ticker | null {
    const key = `${exchange}:${symbol}`;
    const entry = this.tickerCache.get(key);
    if (!entry) return null;

    // Ticker TTL is universally fast (10 seconds)
    if (Date.now() - entry.timestamp > 10 * 1000) {
      this.tickerCache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  static setTicker(exchange: string, symbol: string, data: Ticker): void {
    const key = `${exchange}:${symbol}`;
    this.tickerCache.set(key, { data, timestamp: Date.now() });
  }

  static clear(): void {
    this.ohlcvCache.clear();
    this.tickerCache.clear();
  }
}
