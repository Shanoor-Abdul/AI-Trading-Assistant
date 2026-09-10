import { describe, it, expect } from "vitest";
import { TwelveDataIndicatorAdapter } from "./TwelveDataIndicatorAdapter";
import { Candle } from "./DeterministicApiDecisionEngine";

function generateTestCandles(count: number, basePrice: number, trend = 0.0003): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    price += trend + Math.sin(i / 2) * 0.0001;
    const isBull = trend >= 0;
    const open = isBull ? price - 0.0002 : price + 0.0002;
    const close = isBull ? price + 0.0002 : price - 0.0002;
    const high = Math.max(open, close) + 0.0001;
    const low = Math.min(open, close) - 0.0001;
    const datetime = new Date(now - (count - i) * 300000).toISOString();
    candles.push({
      datetime,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
  }
  return candles;
}

describe("TwelveDataIndicatorAdapter Unit Tests", () => {
  it("Test 1: Parses numeric series (EMA/RSI/ATR) from TwelveData newest-first JSON format", () => {
    const rawTwelveData = {
      meta: { symbol: "EUR/USD", interval: "5min" },
      values: [
        { datetime: "2026-09-10 12:10:00", rsi: "65.40" }, // Newest
        { datetime: "2026-09-10 12:05:00", rsi: "63.20" },
        { datetime: "2026-09-10 12:00:00", rsi: "59.80" }, // Oldest
      ],
      status: "ok",
    };

    const parsed = TwelveDataIndicatorAdapter.parseNumericSeries(rawTwelveData, "rsi");
    expect(parsed.length).toBe(3);
    // Chronological order: oldest first, newest last
    expect(parsed[0]).toBe(59.80);
    expect(parsed[1]).toBe(63.20);
    expect(parsed[2]).toBe(65.40);
  });

  it("Test 2: Handles missing, null, or malformed numeric values safely without NaN/crashing", () => {
    const malformedData = {
      values: [
        { datetime: "1", rsi: null },
        { datetime: "2", rsi: "invalid_string" },
        { datetime: "3", rsi: "55.50" },
        null,
        {},
      ],
    };

    const parsed = TwelveDataIndicatorAdapter.parseNumericSeries(malformedData, "rsi");
    expect(parsed).toEqual([55.50]);
  });

  it("Test 3: Parses MACD series correctly with macd, signal, and histogram", () => {
    const rawMacd = {
      values: [
        { datetime: "2026-09-10 12:05:00", macd: "0.00045", macd_signal: "0.00030", macd_hist: "0.00015" },
        { datetime: "2026-09-10 12:00:00", macd: "0.00040", macd_signal: "0.00028", macd_hist: "0.00012" },
      ],
    };

    const parsed = TwelveDataIndicatorAdapter.parseMacdSeries(rawMacd);
    expect(parsed.length).toBe(2);
    expect(parsed[0].histogram).toBe(0.00012);
    expect(parsed[1].histogram).toBe(0.00015);
  });

  it("Test 4: Parses Bollinger Bands series correctly with upper, middle, and lower bands", () => {
    const rawBB = {
      values: [
        { datetime: "2026-09-10 12:05:00", upper_band: "1.1050", middle_band: "1.1000", lower_band: "1.0950" },
      ],
    };

    const parsed = TwelveDataIndicatorAdapter.parseBollingerSeries(rawBB);
    expect(parsed.length).toBe(1);
    expect(parsed[0].upper).toBe(1.1050);
    expect(parsed[0].middle).toBe(1.1000);
    expect(parsed[0].lower).toBe(1.0950);
  });

  it("Test 5: Normalizes TwelveData live payload and preserves timeframe ownership", () => {
    const payload = {
      "5m": {
        rsi14: { values: [{ rsi: "62.0" }, { rsi: "60.0" }, { rsi: "58.0" }] },
        ema20: { values: [{ ema: "1.1020" }] },
        ema50: { values: [{ ema: "1.1000" }] },
        ema200: { values: [{ ema: "1.0950" }] },
        macd: { values: [{ macd: "0.0003", macd_signal: "0.0002", macd_hist: "0.0001" }, { macd: "0.0002", macd_signal: "0.0001", macd_hist: "0.0001" }, { macd: "0.0001", macd_signal: "0.0000", macd_hist: "0.0001" }] },
        bbands: { values: [{ upper_band: "1.1050", middle_band: "1.1010", lower_band: "1.0970" }] },
        atr14: { values: [{ atr: "0.0008" }] },
      },
      "1h": {
        rsi14: { values: [{ rsi: "54.0" }] },
        ema20: { values: [{ ema: "1.1000" }] },
        ema50: { values: [{ ema: "1.0980" }] },
        ema200: { values: [{ ema: "1.0900" }] },
        macd: { values: [{ macd: "0.0002", macd_signal: "0.0001", macd_hist: "0.0001" }] },
        atr14: { values: [{ atr: "0.0015" }] },
      },
      "4h": {
        ema50: { values: [{ ema: "1.0950" }] },
        ema200: { values: [{ ema: "1.0850" }] },
        atr14: { values: [{ atr: "0.0030" }] },
      },
    };

    const normalized = TwelveDataIndicatorAdapter.normalizeIndicators(payload);
    expect(normalized.source).toBe("twelvedata_api");
    expect(normalized["5m"].rsi).toBe(62.0);
    expect(normalized["5m"].rsiDelta).toBe(4.0); // 62.0 - 58.0
    expect(normalized["5m"].ema20).toBe(1.1020);
    expect(normalized["1h"].rsi).toBe(54.0);
    expect(normalized["1h"].atr).toBe(0.0015);
    expect(normalized["4h"].ema50).toBe(1.0950);
    expect(normalized["4h"].atr).toBe(0.0030);
  });

  it("Test 6: Offline calculator computes valid indicators mathematically consistent with standard period defaults", () => {
    const candles5m = generateTestCandles(40, 1.1000, 0.0002);
    const candles1h = generateTestCandles(40, 1.0950, 0.0004);
    const candles4h = generateTestCandles(40, 1.0900, 0.0006);

    const offline = TwelveDataIndicatorAdapter.calculateOfflineIndicators(candles5m, candles1h, candles4h);
    expect(offline.source).toBe("offline_validated_fallback");
    expect(offline["5m"].ema20).toBeGreaterThan(1.09);
    expect(offline["5m"].rsi).toBeGreaterThan(0);
    expect(offline["5m"].rsi).toBeLessThanOrEqual(100);
    expect(offline["5m"].atr).toBeGreaterThan(0);
    expect(offline["1h"].ema50).toBeGreaterThan(1.09);
    expect(offline["4h"].ema50).toBeGreaterThan(1.08);
  });
});
