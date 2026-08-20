export interface OHLCV {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  last: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface OrderBook {
  bids: [number, number][]; // [price, volume]
  asks: [number, number][];
}

export interface MarketProvider {
  name: string;
  fetchOHLCV(symbol: string, timeframe: string, limit?: number): Promise<OHLCV[]>;
  fetchTicker(symbol: string): Promise<Ticker>;
  fetchOrderBook?(symbol: string, limit?: number): Promise<OrderBook>;
}
