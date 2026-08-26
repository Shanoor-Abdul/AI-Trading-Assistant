import { marketStream } from './MarketStream';
import { MarketTick } from "./MarketStream";

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export class TickStore {
  private ticks: Map<string, MarketTick[]> = new Map();
  // Keep maximum 100,000 ticks per symbol to prevent memory leaks
  private readonly MAX_TICKS = 100000; 

  public addTick(tick: MarketTick) {
    if (!this.ticks.has(tick.symbol)) {
      this.ticks.set(tick.symbol, []);
    }
    const symbolTicks = this.ticks.get(tick.symbol)!;
    symbolTicks.push(tick);
    
    if (symbolTicks.length > this.MAX_TICKS) {
      symbolTicks.shift(); // Remove oldest
    }
  }

  public getTicks(symbol: string): MarketTick[] {
    return this.ticks.get(symbol) || [];
  }

  public generateCandles(symbol: string, timeframeMinutes: number): Candle[] {
    const symbolTicks = this.getTicks(symbol);
    if (symbolTicks.length === 0) return [];

    const timeframeMs = timeframeMinutes * 60 * 1000;
    const candles: Candle[] = [];
    
    let currentCandle: Candle | null = null;
    let currentCandleStartTime = Math.floor(symbolTicks[0].timestamp / timeframeMs) * timeframeMs;

    for (const tick of symbolTicks) {
      const tickPeriod = Math.floor(tick.timestamp / timeframeMs) * timeframeMs;
      
      if (!currentCandle) {
        currentCandle = {
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tick.volume,
          timestamp: tickPeriod
        };
      } else if (tickPeriod === currentCandle.timestamp) {
        currentCandle.high = Math.max(currentCandle.high, tick.price);
        currentCandle.low = Math.min(currentCandle.low, tick.price);
        currentCandle.close = tick.price;
        currentCandle.volume += tick.volume;
      } else {
        // Push finished candle and start new one
        candles.push(currentCandle);
        currentCandle = {
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tick.volume,
          timestamp: tickPeriod
        };
      }
    }

    if (currentCandle) {
      candles.push(currentCandle);
    }

    return candles;
  }
}

export const tickStore = new TickStore();

marketStream.on('tick', (tick) => tickStore.addTick(tick));

