import { describe, it, expect } from 'vitest';
import { RiskEngine, RiskConfig, AccountState } from '../RiskEngine';
import { TradingAnalysis } from '@/lib/types';

describe('RiskEngine', () => {
  const defaultConfig: RiskConfig = {
    minimumRiskReward: 2.0,
    maxDailyLoss: 5,
    maxOpenPositions: 3,
    maxConsecutiveLosses: 3,
    staleDataThresholdSeconds: 300
  };

  const defaultState: AccountState = {
    currentDailyLoss: 0,
    openPositionsCount: 0,
    consecutiveLosses: 0,
    inCooldown: false
  };

  it('allows valid trades', () => {
    const analysis: TradingAnalysis = {
      trend: 'Bullish',
      signal: 'BUY',
      confidence: 85,
      entryPrice: 100,
      stopLoss: 90,
      takeProfit: 130, // Risk = 10, Reward = 30, R:R = 3
      riskReward: 3,
      recommendedTimeframe: '15m',
      explanation: 'Test'
    };

    const result = RiskEngine.validate(analysis, defaultConfig, defaultState);
    expect(result.signal).toBe('BUY');
    expect(result.riskDecision).toBe('APPROVED');
  });

  it('rejects trades with poor risk reward', () => {
    const analysis: TradingAnalysis = {
      trend: 'Bullish',
      signal: 'BUY',
      confidence: 85,
      entryPrice: 100,
      stopLoss: 90,
      takeProfit: 110, // Risk = 10, Reward = 10, R:R = 1
      riskReward: 1,
      recommendedTimeframe: '15m',
      explanation: 'Test'
    };

    const result = RiskEngine.validate(analysis, defaultConfig, defaultState);
    expect(result.signal).toBe('NO_TRADE');
    expect(result.riskDecision).toBe('LOW_RR');
  });

  it('rejects trades with stale data', () => {
    const analysis: TradingAnalysis = {
      trend: 'Bullish',
      signal: 'BUY',
      confidence: 85,
      entryPrice: 100,
      stopLoss: 90,
      takeProfit: 130,
      riskReward: 3,
      recommendedTimeframe: '15m',
      explanation: 'Test',
      dataAge: 400 // Older than 300 seconds
    };

    const result = RiskEngine.validate(analysis, defaultConfig, defaultState);
    expect(result.signal).toBe('NO_TRADE');
    expect(result.riskDecision).toBe('STALE_DATA');
  });

  it('calculates position sizes correctly', () => {
    // 10000 capital, 1% risk ($100), entry 100, SL 90 -> $10 risk per share -> 10 shares
    const size = RiskEngine.calculatePositionSize(10000, 1, 100, 90);
    expect(size).toBe(10);
  });
});
