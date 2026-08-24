import * as crypto from 'crypto';
import { MarketProvider, OHLCV, Ticker } from './MarketProvider';

export class CoinDCXProvider implements MarketProvider {
  name = 'coindcx';
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async testConnection(): Promise<boolean> {
    const timestamp = Math.floor(Date.now());
    const payload = { timestamp };
    const jsonPayload = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', this.apiSecret).update(jsonPayload).digest('hex');

    const response = await fetch('https://api.coindcx.com/exchange/v1/users/balances', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AUTH-APIKEY': this.apiKey,
        'X-AUTH-SIGNATURE': signature,
      },
      body: jsonPayload,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`CoinDCX API connection failed (${response.status}): ${errorText}`);
    }

    return true;
  }

  async fetchOHLCV(symbol: string, timeframe: string, limit?: number): Promise<OHLCV[]> {
    const pair = symbol.replace('/', '_').toUpperCase(); 
    const interval = timeframe || '5m';
    const limitParam = limit || 100;
    const res = await fetch(`https://public.coindcx.com/market_data/candles?pair=B-${pair}&interval=${interval}&limit=${limitParam}`);
    if (!res.ok) throw new Error('Failed to fetch CoinDCX OHLCV');
    const data = await res.json();
    return data.map((c: any) => ({
      openTime: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const pair = symbol.replace('/', '').toUpperCase();
    const res = await fetch('https://api.coindcx.com/exchange/ticker');
    if (!res.ok) throw new Error('Failed to fetch CoinDCX ticker');
    const data = await res.json();
    const ticker = data.find((t: any) => t.market === pair || t.market === `B-${pair}`);
    return {
      symbol,
      last: Number(ticker?.last_price || 0),
      high: Number(ticker?.high || 0),
      low: Number(ticker?.low || 0),
      volume: Number(ticker?.volume || 0),
    };
  }
}
