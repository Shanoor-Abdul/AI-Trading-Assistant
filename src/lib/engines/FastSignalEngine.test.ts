import { describe, expect, it } from "vitest";
import { generateFastSignal } from "./FastSignalEngine";

describe("FastSignalEngine", () => {
  it("returns BUY when independent evidence, confirmation and risk data align", () => {
    const result = generateFastSignal({
      symbol: "BTC/USDT",
      timeframe: "5m",
      market: {
        unifiedMarketData: {
          currentPrice: { value: 100, source: "api", confidence: 100 },
          trend: { value: "Bullish", source: "api", confidence: 100 },
          momentum: { value: "Bullish", source: "api", confidence: 100 },
          marketStructure: { value: "HH/HL Bullish", source: "api", confidence: 100 },
          supportLevels: { value: [95], source: "api", confidence: 100 },
          resistanceLevels: { value: [110], source: "api", confidence: 100 },
          temporalState: {
            transition: "CONTINUATION",
            confirmationStatus: "CONFIRMED",
            regime: "TRENDING_UP",
            conflicts: [],
          },
          evidenceGroups: {
            structure: ["HH/HL Bullish"],
            momentum: ["Bullish momentum"],
            supportResistance: ["Support confirmed"],
          },
          dataConflict: false,
        },
      },
    });

    expect(result.signal).toBe("BUY");
    expect(result.trend).toBe("Bullish");
    expect(result.entryPrice).toBe(100);
    expect(result.stopLoss).toBe(95);
    expect(result.takeProfit).toBe(110);
    expect(result.riskReward).toBe(2);
  });

  it("aggregates structured levels across progressive batches", () => {
    const result = generateFastSignal({
      symbol: "GOLD",
      timeframe: "5m",
      progressive: [
        {
          trend: "Bullish",
          confidence: 70,
          unifiedMarketData: {
            currentPrice: { value: 100, confidence: 80 },
            trend: { value: "Bullish", confidence: 80 },
            marketStructure: { value: "HH/HL", confidence: 75 },
            momentum: { value: "Bullish", confidence: 70 },
            supportLevels: { value: [{ price: 95, confidence: 70 }] },
            resistanceLevels: { value: [{ price: 110, confidence: 70 }] },
            temporalState: { transition: "CONTINUATION", confirmationStatus: "CONFIRMED", regime: "TRENDING_UP", conflicts: [] },
            evidenceGroups: { structure: ["HH/HL"], momentum: ["Bullish"], supportResistance: ["support confirmed"] },
          },
        },
        {
          trend: "Bullish",
          confidence: 80,
          unifiedMarketData: {
            currentPrice: { value: 100, confidence: 85 },
            trend: { value: "Bullish", confidence: 85 },
            marketStructure: { value: "HH/HL", confidence: 80 },
            momentum: { value: "Bullish", confidence: 75 },
            supportLevels: { value: [{ price: 95, confidence: 80 }] },
            resistanceLevels: { value: [{ price: 110, confidence: 80 }] },
            temporalState: { transition: "CONTINUATION", confirmationStatus: "CONFIRMED", regime: "TRENDING_UP", conflicts: [] },
            evidenceGroups: { structure: ["HH/HL"], momentum: ["Bullish"], supportResistance: ["support confirmed"] },
          },
        },
      ],
    });

    expect(result.signal).toBe("BUY");
    expect(result.entryPrice).toBe(100);
    expect(result.stopLoss).toBe(95);
    expect(result.takeProfit).toBe(110);
  });

  it("returns WAIT when exact risk data is missing", () => {
    const result = generateFastSignal({
      symbol: "GOLD",
      timeframe: "5m",
      progressive: [
        {
          trend: "Bullish",
          confidence: 80,
          unifiedMarketData: {
            trend: { value: "Bullish", confidence: 80 },
            marketStructure: { value: "HH/HL", confidence: 75 },
            momentum: { value: "Bullish", confidence: 70 },
            temporalState: { transition: "CONTINUATION", confirmationStatus: "CONFIRMED", regime: "TRENDING_UP", conflicts: [] },
            evidenceGroups: { structure: ["HH/HL"], momentum: ["Bullish"], indicators: ["MACD Bullish"] },
          },
        },
      ],
    });

    expect(result.signal).toBe("WAIT");
    expect(result.explanation).toContain("Missing precise visual risk data");
  });

  it("returns WAIT when bullish and bearish evidence conflict", () => {
    const result = generateFastSignal({
      symbol: "BTC/USDT",
      timeframe: "5m",
      progressive: [
        {
          trend: "Bullish",
          momentum: "Bearish",
          marketState: "Reversal",
          confidence: 80,
          unifiedMarketData: {
            dataConflict: true,
            temporalState: { conflicts: ["direction conflict"] },
          },
        },
      ],
    });

    expect(result.signal).toBe("WAIT");
    expect(result.readiness).toBe("NOT READY");
  });

  it("does not make network calls or require an AI key", () => {
    const started = Date.now();
    const result = generateFastSignal({
      symbol: "ETH/USDT",
      timeframe: "5m",
      progressive: [{ trend: "Sideways", momentum: "Neutral", confidence: 70 }],
    });

    expect(Date.now() - started).toBeLessThan(50);
    expect(result.latencyMode).toBe("LOCAL_TEXT");
  });
});
