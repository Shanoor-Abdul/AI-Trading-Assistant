import * as ccxt from 'ccxt';
import { MarketProvider, OHLCV, Ticker } from './MarketProvider';

export class CCXTProvider implements MarketProvider {
  name: string;
  private exchange: ccxt.Exchange;

  constructor(exchangeId: string = 'binance') {
    this.name = exchangeId;
    
    // Check if exchange is supported
    if (!(ccxt as any)[exchangeId]) {
      throw new Error(`Exchange ${exchangeId} is not supported by CCXT.`);
    }

    // Initialize the CCXT exchange dynamically
    // We cast to any because ccxt exports exchange classes as properties
    const ExchangeClass = (ccxt as any)[exchangeId];
    this.exchange = new ExchangeClass({
      enableRateLimit: true,
    });
  }

  async fetchOHLCV(symbol: string, timeframe: string, limit: number = 200): Promise<OHLCV[]> {
    try {
      // CCXT expects uppercase standard symbols e.g. BTC/USDT
      // We will assume the UI passes a normalized symbol, or we normalize here if needed.
      const normalizedSymbol = symbol.includes('/') ? symbol : symbol.replace(/([A-Z]+)(USDT|USD|BTC|ETH)$/, '$1/$2');
      
      const ohlcvRaw = await this.exchange.fetchOHLCV(normalizedSymbol, timeframe, undefined, limit);
      
      return ohlcvRaw.map(candle => ({
        openTime: candle[0] as number,
        open: candle[1] as number,
        high: candle[2] as number,
        low: candle[3] as number,
        close: candle[4] as number,
        volume: candle[5] as number,
      }));
    } catch (error: any) {
      console.error(`CCXT fetchOHLCV Error [${this.name}]:`, error.message);
      throw error;
    }
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    try {
      const normalizedSymbol = symbol.includes('/') ? symbol : symbol.replace(/([A-Z]+)(USDT|USD|BTC|ETH)$/, '$1/$2');
      const ticker = await this.exchange.fetchTicker(normalizedSymbol);
      
      return {
        symbol: ticker.symbol || symbol,
        last: ticker.last!,
        bid: ticker.bid,
        ask: ticker.ask,
        high: ticker.high,
        low: ticker.low,
        volume: ticker.baseVolume,
      };
    } catch (error: any) {
      console.error(`CCXT fetchTicker Error [${this.name}]:`, error.message);
      throw error;
    }
  }
}
