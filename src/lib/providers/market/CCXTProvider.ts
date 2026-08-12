import * as ccxt from 'ccxt';
import { MarketProvider, OHLCV, Ticker } from './MarketProvider';
import { MarketCache } from '../../cache/MarketCache';

export class CCXTProvider implements MarketProvider {
  name: string;
  private exchange: ccxt.Exchange;

  constructor(exchangeId: string = 'binance', apiKey?: string, apiSecret?: string, apiPassphrase?: string) {
    this.name = exchangeId;
    
    // Check if exchange is supported
    if (!(ccxt as any)[exchangeId]) {
      throw new Error(`Exchange ${exchangeId} is not supported by CCXT.`);
    }

    // Initialize the CCXT exchange dynamically
    const ExchangeClass = (ccxt as any)[exchangeId];
    this.exchange = new ExchangeClass({
      enableRateLimit: true,
      apiKey: apiKey,
      secret: apiSecret,
      password: apiPassphrase,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.exchange.fetchBalance();
      return true;
    } catch (error) {
      throw error;
    }
  }

  async fetchOHLCV(symbol: string, timeframe: string, limit: number = 200): Promise<OHLCV[]> {
    try {
      const normalizedSymbol = symbol.includes('/') ? symbol : symbol.replace(/([A-Z]+)(USDT|USD|BTC|ETH)$/, '$1/$2');
      
      const cached = MarketCache.getOHLCV(this.name, normalizedSymbol, timeframe);
      if (cached && cached.length >= limit) {
        return cached;
      }

      const ohlcvRaw = await this.exchange.fetchOHLCV(normalizedSymbol, timeframe, undefined, limit);
      
      const formatted = ohlcvRaw.map(candle => ({
        openTime: candle[0] as number,
        open: candle[1] as number,
        high: candle[2] as number,
        low: candle[3] as number,
        close: candle[4] as number,
        volume: candle[5] as number,
      }));

      MarketCache.setOHLCV(this.name, normalizedSymbol, timeframe, formatted);
      return formatted;
    } catch (error: any) {
      console.error(`CCXT fetchOHLCV Error [${this.name}]:`, error.message);
      throw error;
    }
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    try {
      const normalizedSymbol = symbol.includes('/') ? symbol : symbol.replace(/([A-Z]+)(USDT|USD|BTC|ETH)$/, '$1/$2');
      
      const cached = MarketCache.getTicker(this.name, normalizedSymbol);
      if (cached) return cached;

      const ticker = await this.exchange.fetchTicker(normalizedSymbol);
      
      const formatted = {
        symbol: ticker.symbol || symbol,
        last: ticker.last!,
        bid: ticker.bid,
        ask: ticker.ask,
        high: ticker.high,
        low: ticker.low,
        volume: ticker.baseVolume,
      };

      MarketCache.setTicker(this.name, normalizedSymbol, formatted);
      return formatted;
    } catch (error: any) {
      console.error(`CCXT fetchTicker Error [${this.name}]:`, error.message);
      throw error;
    }
  }
}
