import { describe, expect, it } from "vitest";
import { generateFastSignal } from "./FastSignalEngine";

describe("FastSignalEngine", () => {
  it("returns BUY from aligned bullish text evidence", () => {
    const result = generateFastSignal({
      symbol: "BTC/USDT",
      timeframe: "5m",
      market: {
        unifiedMarketData: {
          currentPrice: { value: 100, source: "api" },
          trend: { value: "Bullish", source: "api" },
          momentum: { value: "Bullish", source: "api" },
          marketStructure: { value: "Bullish", source: "api" },
          supportLevels: { value: [95], source: "api" },
          resistanceLevels: { value: [105], source: "api" },
          dataConflict: false,
        },
      },
    });

    expect(result.signal).toBe("BUY");
    expect(result.trend).toBe("Bullish");
    expect(result.confidence).toBeGreaterThanOrEqual(80);
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
