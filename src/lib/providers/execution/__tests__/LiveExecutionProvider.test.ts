import { describe, it, expect, vi } from 'vitest';
import { LiveExecutionProvider } from '../LiveExecutionProvider';

// Mock CCXT
vi.mock('ccxt', () => {
  return {
    default: {
      binance: class {
        constructor() {}
        async checkRequiredCredentials() { return true; }
        async fetchBalance() { return { total: { USDT: 1000 } }; }
        async createOrder(symbol: string, type: string, side: string, amount: number) {
          return { id: 'mock-order-123', price: 50000, fee: { cost: 1.5 } };
        }
      }
    }
  };
});

describe('LiveExecutionProvider', () => {
  it('connects to exchange successfully', async () => {
    const provider = new LiveExecutionProvider('binance', 'key', 'secret');
    await expect(provider.connect()).resolves.toBeUndefined();
  });

  it('executes trade and returns correct status', async () => {
    const provider = new LiveExecutionProvider('binance', 'key', 'secret');
    
    const analysis = {
      trend: "Bullish" as any,
      signal: "BUY" as any,
      confidence: 90,
      entryPrice: 50000,
      takeProfit: 55000,
      stopLoss: 48000,
      explanation: "Test",
      recommendedTimeframe: "1h"
    };

    const result = await provider.executeTrade('BTC/USDT', analysis, 0.1);
    
    expect(result.orderId).toBe('mock-order-123');
    expect(result.status).toBe('OPEN');
    expect(result.slippage).toBe(0);
    expect(result.fees).toBe(1.5);
  });
});
