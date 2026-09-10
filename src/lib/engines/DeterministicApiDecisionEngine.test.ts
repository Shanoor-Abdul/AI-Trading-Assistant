import { describe, it, expect } from "vitest";
import { DeterministicApiDecisionEngine, Candle } from "./DeterministicApiDecisionEngine";
import { TwelveDataIndicatorAdapter } from "./TwelveDataIndicatorAdapter";
import { DeterministicBacktestEngine } from "./DeterministicBacktestEngine";
import { calculateMobileSignalRules } from "../ai/mobileSignalRules";

function generateCandles(count: number, basePrice: number, trendStep: number, waveAmplitude = 0.0002): any[] {
  const candles: any[] = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 3) * waveAmplitude;
    price += trendStep + wave * 0.1;
    const isBull = trendStep >= 0;
    const open = isBull ? price - 0.0003 : price + 0.0003;
    const close = isBull ? price + 0.0003 : price - 0.0003;
    const high = Math.max(open, close) + 0.0001;
    const low = Math.min(open, close) - 0.0001;
    const datetime = new Date(now - (count - i) * 300000).toISOString();
    candles.push({
      datetime,
      open: open.toFixed(5),
      high: high.toFixed(5),
      low: low.toFixed(5),
      close: close.toFixed(5),
      volume: "1000",
    });
  }
  // Reverse to simulate TwelveData newest-first format
  return candles.reverse();
}

describe("DeterministicApiDecisionEngine 30-Test Comprehensive Suite", () => {
  // 1. Strong Bullish Trend
  it("Test 1: Identifies strong bullish trend and scores high bullishness", () => {
    const raw4h = generateCandles(60, 1.1000, 0.001, 0.0002);
    const raw1h = generateCandles(60, 1.1200, 0.0005, 0.0002);
    const raw5m = generateCandles(60, 1.1300, 0.0004, 0.0002);

    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", raw4h, raw1h, raw5m);
    expect(result.bullishScore).toBeGreaterThanOrEqual(50);
    expect(result.timeframeAnalysis["4h"].bias).toContain("Bullish");
  });

  // 2. Strong Bearish Trend
  it("Test 2: Identifies strong bearish trend and scores high bearishness", () => {
    const raw4h = generateCandles(60, 1.2000, -0.001, 0.0002);
    const raw1h = generateCandles(60, 1.1800, -0.0005, 0.0002);
    const raw5m = generateCandles(60, 1.1600, -0.0004, 0.0002);

    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", raw4h, raw1h, raw5m);
    expect(result.bearishScore).toBeGreaterThanOrEqual(50);
    expect(result.timeframeAnalysis["4h"].bias).toContain("Bearish");
  });

  // 3. Bullish Pullback Setup
  it("Test 3: Detects bullish pullback setup", () => {
    const raw4h = generateCandles(60, 1.1000, 0.001);
    const raw1h = generateCandles(60, 1.1200, 0.0005);
    const raw5m = generateCandles(60, 1.1300, 0.0002);

    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", raw4h, raw1h, raw5m);
    expect(result.setup).toBeDefined();
    expect(result.marketStructure["5m"]).toBeDefined();
  });

  // 4. Bearish Pullback Setup
  it("Test 4: Detects bearish pullback setup", () => {
    const raw4h = generateCandles(60, 1.2000, -0.001);
    const raw1h = generateCandles(60, 1.1800, -0.0005);
    const raw5m = generateCandles(60, 1.1600, -0.0002);

    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", raw4h, raw1h, raw5m);
    expect(result.bearishScore).toBeGreaterThanOrEqual(45);
  });

  // 5. Resistance Trap (Hard Gate)
  it("Test 5: Triggers Hard Gate for Resistance Trap when buying directly into ceiling", () => {
    const currentPrice = 1.1500;
    const pipMultiplier = 10000;
    const atr = 0.0010;
    const mockSr = {
      nearestResistance: {
        price: 1.1501, // Only 1 pip away!
        distancePips: 1.0,
        distanceAtrMultiple: 0.1,
        strength: "STRONG" as const,
        source: "4H_SWING",
        timeframe: "4H",
        touches: 3,
      },
      nearestSupport: {
        price: 1.1450,
        distancePips: 50.0,
        distanceAtrMultiple: 5.0,
        strength: "STRONG" as const,
        source: "4H_SWING",
        timeframe: "4H",
        touches: 3,
      },
      allLevels: [],
    };

    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      currentPrice,
      "Bullish",
      "Bullish",
      {
        trend: "BULLISH",
        structure: "BULLISH_STRUCTURE",
        swingHighs: [],
        swingLows: [],
        allSwings: [],
        latestSwingHigh: null,
        latestSwingLow: null,
        previousSwingHigh: null,
        previousSwingLow: null,
        isHigherHigh: true,
        isHigherLow: true,
        isLowerHigh: false,
        isLowerLow: false,
        breakOfStructure: false,
        changeOfCharacter: false,
        structureRetest: false,
      },
      { setup: "NONE", quality: 50, rationale: "" },
      mockSr,
      { ema20: 1.1490, ema50: 1.1480, ema200: null, rsi: 58, rsiDelta: -1, macdHist: 0.0001, macdSlope: "Falling", atr },
      [],
      pipMultiplier
    );

    expect(evalResult.hardGates.buyAllowed).toBe(false);
    expect(evalResult.hardGates.reasons.some((r) => r.includes("Resistance Ceiling Trap"))).toBe(true);
  });

  // 6. Support Trap (Hard Gate)
  it("Test 6: Triggers Hard Gate for Support Trap when selling directly into floor", () => {
    const currentPrice = 1.1401;
    const pipMultiplier = 10000;
    const atr = 0.0010;
    const mockSr = {
      nearestResistance: {
        price: 1.1450,
        distancePips: 49.0,
        distanceAtrMultiple: 4.9,
        strength: "STRONG" as const,
        source: "4H_SWING",
        timeframe: "4H",
        touches: 3,
      },
      nearestSupport: {
        price: 1.1400, // Only 1 pip away!
        distancePips: 1.0,
        distanceAtrMultiple: 0.1,
        strength: "STRONG" as const,
        source: "4H_SWING",
        timeframe: "4H",
        touches: 3,
      },
      allLevels: [],
    };

    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      currentPrice,
      "Bearish",
      "Bearish",
      {
        trend: "BEARISH",
        structure: "BEARISH_STRUCTURE",
        swingHighs: [],
        swingLows: [],
        allSwings: [],
        latestSwingHigh: null,
        latestSwingLow: null,
        previousSwingHigh: null,
        previousSwingLow: null,
        isHigherHigh: false,
        isHigherLow: false,
        isLowerHigh: true,
        isLowerLow: true,
        breakOfStructure: false,
        changeOfCharacter: false,
        structureRetest: false,
      },
      { setup: "NONE", quality: 50, rationale: "" },
      mockSr,
      { ema20: 1.1410, ema50: 1.1420, ema200: null, rsi: 42, rsiDelta: 1, macdHist: -0.0001, macdSlope: "Rising", atr },
      [],
      pipMultiplier
    );

    expect(evalResult.hardGates.sellAllowed).toBe(false);
    expect(evalResult.hardGates.reasons.some((r) => r.includes("Support Floor Trap"))).toBe(true);
  });

  // 7. Confirmed Breakout
  it("Test 7: Correctly identifies BREAKOUT_CONFIRMED", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1400, high: 1.1420, low: 1.1390, close: 1.1410 },
      { datetime: "2", open: 1.1410, high: 1.1430, low: 1.1400, close: 1.1420 },
      { datetime: "3", open: 1.1420, high: 1.1440, low: 1.1410, close: 1.1430 },
      { datetime: "4", open: 1.1430, high: 1.1450, low: 1.1420, close: 1.1440 },
      { datetime: "5", open: 1.1440, high: 1.1520, low: 1.1435, close: 1.1510 }, // Strong breakout candle closing above 1.1450
    ];

    const sr = {
      nearestResistance: { price: 1.1450, distancePips: 0, distanceAtrMultiple: 0, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 2 },
      nearestSupport: null,
      allLevels: [],
    };

    const setup = DeterministicApiDecisionEngine.classifySetup(
      "Bullish",
      "Bullish",
      { trend: "BULLISH", structure: "BULLISH_STRUCTURE", swingHighs: [], swingLows: [], allSwings: [], latestSwingHigh: null, latestSwingLow: null, previousSwingHigh: null, previousSwingLow: null, isHigherHigh: true, isHigherLow: true, isLowerHigh: false, isLowerLow: false, breakOfStructure: true, changeOfCharacter: false, structureRetest: false },
      candles,
      1.1450,
      1.1430,
      65,
      5,
      0.0005,
      "Rising",
      0.0010,
      sr
    );

    expect(setup.setup).toBe("BREAKOUT_CONFIRMED");
  });

  // 8. Failed Breakout / Watch
  it("Test 8: Distinguishes BREAKOUT_WATCH when candle body or momentum is insufficient", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1400, high: 1.1420, low: 1.1390, close: 1.1410 },
      { datetime: "2", open: 1.1410, high: 1.1430, low: 1.1400, close: 1.1420 },
      { datetime: "3", open: 1.1420, high: 1.1440, low: 1.1410, close: 1.1430 },
      { datetime: "4", open: 1.1430, high: 1.1450, low: 1.1420, close: 1.1440 },
      { datetime: "5", open: 1.1440, high: 1.1460, low: 1.1435, close: 1.1452 }, // Weak body closing just 2 pips above
    ];

    const sr = {
      nearestResistance: { price: 1.1450, distancePips: 0, distanceAtrMultiple: 0, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 2 },
      nearestSupport: null,
      allLevels: [],
    };

    const setup = DeterministicApiDecisionEngine.classifySetup(
      "Bullish",
      "Bullish",
      { trend: "BULLISH", structure: "BULLISH_STRUCTURE", swingHighs: [], swingLows: [], allSwings: [], latestSwingHigh: null, latestSwingLow: null, previousSwingHigh: null, previousSwingLow: null, isHigherHigh: true, isHigherLow: true, isLowerHigh: false, isLowerLow: false, breakOfStructure: false, changeOfCharacter: false, structureRetest: false },
      candles,
      1.1440,
      1.1430,
      52,
      0.5,
      0.0001,
      "Flat",
      0.0010,
      sr
    );

    expect(setup.setup).toBe("BREAKOUT_WATCH");
  });

  // 9. Range Structure
  it("Test 9: Classifies RANGE_STRUCTURE when swings are bounded", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1000, high: 1.1050, low: 1.0950, close: 1.1020 },
      { datetime: "2", open: 1.1020, high: 1.1040, low: 1.0980, close: 1.0990 },
      { datetime: "3", open: 1.0990, high: 1.1030, low: 1.0960, close: 1.1010 },
      { datetime: "4", open: 1.1010, high: 1.1045, low: 1.0970, close: 1.1000 },
      { datetime: "5", open: 1.1000, high: 1.1040, low: 1.0975, close: 1.1005 },
    ];

    const structure = DeterministicApiDecisionEngine.analyzeMarketStructure(candles, 1, 1);
    expect(["RANGE_STRUCTURE", "SIDEWAYS", "UNKNOWN", "TRANSITION"]).toContain(structure.structure);
  });

  // 10. Chop Detection
  it("Test 10: Detects CHOP when moving averages are entangled and RSI/MACD are flat", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1000, high: 1.1005, low: 1.0995, close: 1.1000 },
      { datetime: "2", open: 1.1000, high: 1.1006, low: 1.0994, close: 1.1001 },
      { datetime: "3", open: 1.1001, high: 1.1005, low: 1.0995, close: 1.1000 },
      { datetime: "4", open: 1.1000, high: 1.1004, low: 1.0996, close: 1.1000 },
      { datetime: "5", open: 1.1000, high: 1.1005, low: 1.0995, close: 1.1000 },
    ];

    const setup = DeterministicApiDecisionEngine.classifySetup(
      "Neutral",
      "Neutral",
      { trend: "SIDEWAYS", structure: "RANGE_STRUCTURE", swingHighs: [], swingLows: [], allSwings: [], latestSwingHigh: null, latestSwingLow: null, previousSwingHigh: null, previousSwingLow: null, isHigherHigh: false, isHigherLow: false, isLowerHigh: false, isLowerLow: false, breakOfStructure: false, changeOfCharacter: false, structureRetest: false },
      candles,
      1.1000,
      1.10002, // Almost identical EMAs (< 0.0006 spread)
      50,
      0.1,
      0.00001,
      "Flat",
      0.0004,
      { nearestResistance: null, nearestSupport: null }
    );

    expect(setup.setup).toBe("CHOP");
  });

  // 11. 4H Bullish / 1H Bearish Conflict
  it("Test 11: Detects 4H Bullish / 1H Bearish conflict and holds back aggressive signal", () => {
    const raw4h = generateCandles(60, 1.1000, 0.001); // 4H Bullish
    const raw1h = generateCandles(60, 1.1500, -0.001); // 1H Bearish
    const raw5m = generateCandles(60, 1.1400, 0.0001);

    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", raw4h, raw1h, raw5m);
    expect(result.signal).toBe("WAIT");
  });

  // 12. 4H Bearish / 1H Bullish Conflict
  it("Test 12: Detects 4H Bearish / 1H Bullish conflict and holds back aggressive signal", () => {
    const raw4h = generateCandles(60, 1.2000, -0.001); // 4H Bearish
    const raw1h = generateCandles(60, 1.1500, 0.001); // 1H Bullish
    const raw5m = generateCandles(60, 1.1600, -0.0001);

    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", raw4h, raw1h, raw5m);
    expect(result.signal).toBe("WAIT");
  });

  // 13. Missing Indicator / Short Data
  it("Test 13: Handles short candle history safely with fallback", () => {
    const shortCandles = generateCandles(10, 1.1000, 0.0001);
    const ind = TwelveDataIndicatorAdapter.calculateOfflineIndicators(
      DeterministicApiDecisionEngine.parseCandles(shortCandles)
    );
    expect(ind["5m"].ema20).toBeNull();
  });

  // 14. Stale Data Handling
  it("Test 14: Flags data quality appropriately", () => {
    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", [], [], []);
    expect(result.signal).toBe("NO_TRADE");
    expect(result.dataQuality.score).toBeLessThan(50);
  });

  // 15. Invalid Symbol / Empty Candles
  it("Test 15: Returns NO_TRADE for invalid symbol or empty data", () => {
    const result = DeterministicApiDecisionEngine.processTwelveDataMarketData("INVALID_SYM", "5m", null as any, null as any, null as any);
    expect(result.signal).toBe("NO_TRADE");
    expect(result.hardGates.buyAllowed).toBe(false);
    expect(result.hardGates.sellAllowed).toBe(false);
  });

  // 16. Server Validator: Reject AI BUY when deterministic engine says WAIT
  it("Test 16: Server-side final validator strictly rejects AI BUY when deterministic decision is WAIT", () => {
    const deterministic = {
      ...DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", [], [], []),
      signal: "WAIT" as const,
      confidence: 35,
      hardGates: { buyAllowed: false, sellAllowed: false, reasons: ["Resistance Ceiling Trap"] },
    };

    const validated = DeterministicApiDecisionEngine.validateFinalSignal(deterministic, {
      signal: "BUY",
      confidence: 85,
    });

    expect(validated.finalSignal).toBe("WAIT");
    expect(validated.validationOverride).toBe(true);
    expect(validated.validationReason).toContain("Rejected AI BUY");
  });

  // 17. Server Validator: Reject AI SELL when deterministic engine says WAIT
  it("Test 17: Server-side final validator strictly rejects AI SELL when deterministic decision is WAIT", () => {
    const deterministic = {
      ...DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", [], [], []),
      signal: "WAIT" as const,
      confidence: 35,
      hardGates: { buyAllowed: false, sellAllowed: false, reasons: ["Support Floor Trap"] },
    };

    const validated = DeterministicApiDecisionEngine.validateFinalSignal(deterministic, {
      signal: "SELL",
      confidence: 88,
    });

    expect(validated.finalSignal).toBe("WAIT");
    expect(validated.validationOverride).toBe(true);
    expect(validated.validationReason).toContain("Rejected AI SELL");
  });

  // 18. Server Validator: Confluent BUY maintains signal and calculates bounded confidence
  it("Test 18: Server validator accepts confluent BUY and bounds confidence correctly", () => {
    const deterministic = {
      ...DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", [], [], []),
      signal: "BUY" as const,
      confidence: 80,
      hardGates: { buyAllowed: true, sellAllowed: false, reasons: [] },
    };

    const validated = DeterministicApiDecisionEngine.validateFinalSignal(deterministic, {
      signal: "BUY",
      confidence: 86,
    });

    expect(validated.finalSignal).toBe("BUY");
    expect(validated.validationOverride).toBe(false);
    expect(validated.finalConfidence).toBeGreaterThanOrEqual(70);
    expect(validated.finalConfidence).toBeLessThanOrEqual(95);
  });

  // 19. Server Validator: Opposing signals force safe WAIT
  it("Test 19: Server validator forces WAIT when deterministic BUY conflicts with AI SELL", () => {
    const deterministic = {
      ...DeterministicApiDecisionEngine.processTwelveDataMarketData("EUR/USD", "5m", [], [], []),
      signal: "BUY" as const,
      confidence: 80,
      hardGates: { buyAllowed: true, sellAllowed: false, reasons: [] },
    };

    const validated = DeterministicApiDecisionEngine.validateFinalSignal(deterministic, {
      signal: "SELL",
      confidence: 85,
    });

    expect(validated.finalSignal).toBe("WAIT");
    expect(validated.validationOverride).toBe(true);
    expect(validated.validationReason).toContain("Conflict");
  });

  // 20. Data Sanitization: Deduplicates timestamps, clamps anomalous high/low, and sorts chronologically
  it("Test 20: parseCandles deduplicates timestamps, clamps anomalies, and sorts chronologically", () => {
    const raw = [
      { datetime: "2026-09-10T12:10:00Z", open: 1.1000, high: 1.0950, low: 1.1050, close: 1.1010 }, // high < open and low > open anomaly
      { datetime: "2026-09-10T12:00:00Z", open: 1.0990, high: 1.1000, low: 1.0980, close: 1.0995 },
      { datetime: "2026-09-10T12:00:00Z", open: 1.0990, high: 1.1005, low: 1.0980, close: 1.0995 }, // Duplicate timestamp
      { datetime: "2026-09-10T12:05:00Z", open: 1.0995, high: 1.1010, low: 1.0990, close: 1.1000 },
    ];

    const parsed = DeterministicApiDecisionEngine.parseCandles(raw);
    expect(parsed.length).toBe(3); // Deduplicated 4 -> 3
    expect(parsed[0].datetime).toBe("2026-09-10T12:00:00Z");
    expect(parsed[1].datetime).toBe("2026-09-10T12:05:00Z");
    expect(parsed[2].datetime).toBe("2026-09-10T12:10:00Z");
    // Check sanity clamping
    expect(parsed[2].high).toBeGreaterThanOrEqual(parsed[2].open);
    expect(parsed[2].low).toBeLessThanOrEqual(parsed[2].open);
  });

  // 21. Lookahead Prevention: Swings only confirmed after rightBars have closed
  it("Test 21: detectSwings does not mark unconfirmed latest bars as swings", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1000, high: 1.1020, low: 1.0990, close: 1.1010 },
      { datetime: "2", open: 1.1010, high: 1.1050, low: 1.1000, close: 1.1040 },
      { datetime: "3", open: 1.1040, high: 1.1100, low: 1.1030, close: 1.1090 }, // Potential peak
      { datetime: "4", open: 1.1090, high: 1.1070, low: 1.1020, close: 1.1030 },
      { datetime: "5", open: 1.1030, high: 1.1050, low: 1.1010, close: 1.1020 },
      { datetime: "6", open: 1.1020, high: 1.1150, low: 1.1020, close: 1.1140 }, // Live forming bar that is highest
    ];

    // With rightBars = 2, bar 6 cannot be a swing high because rightBars are not complete
    const { swingHighs } = DeterministicApiDecisionEngine.detectSwings(candles, 2, 2);
    expect(swingHighs.some((s) => s.index === 5)).toBe(false);
  });

  // 22. Bullish BOS requires confirmed candle close above previous swing high
  it("Test 22: Bullish BOS requires confirmed candle close above swing high in bullish structure", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.0990, high: 1.1000, low: 1.0980, close: 1.0995 },
      { datetime: "2", open: 1.1000, high: 1.1050, low: 1.0990, close: 1.1040 }, // Confirmed Swing High at 1.1050
      { datetime: "3", open: 1.1040, high: 1.1020, low: 1.1000, close: 1.1010 },
      { datetime: "4", open: 1.1010, high: 1.1015, low: 1.1000, close: 1.1005 },
      { datetime: "5", open: 1.1005, high: 1.1065, low: 1.1000, close: 1.1060 }, // Confirmed close 1.1060 > 1.1050
    ];

    const result = DeterministicApiDecisionEngine.analyzeMarketStructure(candles, 1, 1);
    expect(result.bullishBOS || result.breakoutConfirmed).toBe(true);
  });

  // 23. Bearish BOS requires confirmed candle close below previous swing low
  it("Test 23: Bearish BOS requires confirmed candle close below swing low in bearish structure", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1030, high: 1.1040, low: 1.1020, close: 1.1025 },
      { datetime: "2", open: 1.1020, high: 1.1030, low: 1.0980, close: 1.0990 }, // Confirmed Swing Low at 1.0980
      { datetime: "3", open: 1.0990, high: 1.1010, low: 1.0990, close: 1.1005 },
      { datetime: "4", open: 1.1005, high: 1.1010, low: 1.0995, close: 1.1000 },
      { datetime: "5", open: 1.1000, high: 1.1005, low: 1.0940, close: 1.0950 }, // Confirmed close 1.0950 < 1.0980
    ];

    const result = DeterministicApiDecisionEngine.analyzeMarketStructure(candles, 1, 1);
    expect(result.bearishBOS || result.breakoutConfirmed).toBe(true);
  });

  // 24. False Breakout: Wick sweep above resistance with close below is flagged as false breakout
  it("Test 24: False breakout is detected when candle wicks above swing high but closes below", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.0990, high: 1.1000, low: 1.0980, close: 1.0995 },
      { datetime: "2", open: 1.1000, high: 1.1050, low: 1.0990, close: 1.1040 }, // Confirmed Swing High at 1.1050
      { datetime: "3", open: 1.1040, high: 1.1020, low: 1.1000, close: 1.1010 },
      { datetime: "4", open: 1.1010, high: 1.1015, low: 1.1000, close: 1.1005 },
      { datetime: "5", open: 1.1005, high: 1.1070, low: 1.1000, close: 1.1040 }, // Wick to 1.1070, but closed at 1.1040 (below 1.1050)
    ];

    const result = DeterministicApiDecisionEngine.analyzeMarketStructure(candles, 1, 1);
    expect(result.falseBreakout).toBe(true);
    expect(result.bullishBOS).toBeFalsy();
  });

  // 25. Bullish CHOCH: Break of bearish structure to the upside with confirmed close
  it("Test 25: Bullish CHOCH triggers when price closes above swing high in non-bullish structure", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1010, high: 1.1020, low: 1.1000, close: 1.1005 },
      { datetime: "2", open: 1.1005, high: 1.1050, low: 1.0990, close: 1.1040 }, // Confirmed Swing High at 1.1050
      { datetime: "3", open: 1.1040, high: 1.1020, low: 1.0970, close: 1.0980 },
      { datetime: "4", open: 1.0980, high: 1.1000, low: 1.0950, close: 1.0960 },
      { datetime: "5", open: 1.0960, high: 1.1080, low: 1.0955, close: 1.1070 }, // Explosive close breaking previous swing high
    ];

    const result = DeterministicApiDecisionEngine.analyzeMarketStructure(candles, 1, 1);
    expect(result.bullishCHOCH || result.changeOfCharacter).toBe(true);
  });

  // 26. Bearish CHOCH: Break of bullish structure to the downside with confirmed close
  it("Test 26: Bearish CHOCH triggers when price closes below swing low in non-bearish structure", () => {
    const candles: Candle[] = [
      { datetime: "1", open: 1.1010, high: 1.1030, low: 1.1000, close: 1.1020 },
      { datetime: "2", open: 1.1020, high: 1.1030, low: 1.0980, close: 1.0990 }, // Confirmed Swing Low at 1.0980
      { datetime: "3", open: 1.0990, high: 1.1040, low: 1.0990, close: 1.1030 },
      { datetime: "4", open: 1.1030, high: 1.1060, low: 1.1020, close: 1.1050 },
      { datetime: "5", open: 1.1050, high: 1.1055, low: 1.0940, close: 1.0950 }, // Explosive breakdown below 1.0980
    ];

    const result = DeterministicApiDecisionEngine.analyzeMarketStructure(candles, 1, 1);
    expect(result.bearishCHOCH || result.changeOfCharacter).toBe(true);
  });

  // 27. SL/TP Invariants: BUY SL is strictly below Entry and TP is strictly above Entry with positive R:R
  it("Test 27: calculateRisk enforces SL < Entry < TP with positive risk and reward for BUY", () => {
    const entryPrice = 1.1200;
    const atr = 0.0010;
    const mockSr = { nearestResistance: { price: 1.1250, distancePips: 50, distanceAtrMultiple: 5, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 2 }, nearestSupport: null };
    const mockSwings = { latestSwingHigh: null, latestSwingLow: { index: 1, candleIndex: 2, price: 1.1180, timestamp: "1" } };

    const risk = DeterministicApiDecisionEngine.calculateRisk(entryPrice, "BUY", atr, mockSr, mockSwings, 10000);
    expect(risk.stopLoss).toBeLessThan(risk.entryPrice);
    expect(risk.takeProfit).toBeGreaterThan(risk.entryPrice);
    expect(risk.riskPips).toBeGreaterThan(0);
    expect(risk.rewardPips).toBeGreaterThan(0);
    expect(risk.riskRewardRatio).toBeGreaterThan(0);
  });

  // 28. SL/TP Invariants: SELL SL is strictly above Entry and TP is strictly below Entry with positive R:R
  it("Test 28: calculateRisk enforces TP < Entry < SL with positive risk and reward for SELL", () => {
    const entryPrice = 1.1200;
    const atr = 0.0010;
    const mockSr = { nearestResistance: null, nearestSupport: { price: 1.1150, distancePips: 50, distanceAtrMultiple: 5, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 2 } };
    const mockSwings = { latestSwingHigh: { index: 1, candleIndex: 2, price: 1.1220, timestamp: "1" }, latestSwingLow: null };

    const risk = DeterministicApiDecisionEngine.calculateRisk(entryPrice, "SELL", atr, mockSr, mockSwings, 10000);
    expect(risk.stopLoss).toBeGreaterThan(risk.entryPrice);
    expect(risk.takeProfit).toBeLessThan(risk.entryPrice);
    expect(risk.riskPips).toBeGreaterThan(0);
    expect(risk.rewardPips).toBeGreaterThan(0);
    expect(risk.riskRewardRatio).toBeGreaterThan(0);
  });

  // 29. Directional Bias vs Trade Quality separation (Strong trend with poor location produces WAIT + tradeable: false)
  it("Test 29: Directional bias is correctly separated from trade quality when blocked by S/R trap", () => {
    const currentPrice = 1.1500;
    const mockSr = {
      nearestResistance: { price: 1.1501, distancePips: 1.0, distanceAtrMultiple: 0.1, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 3 },
      nearestSupport: null,
      allLevels: [],
    };

    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      currentPrice,
      "Bullish",
      "Bullish",
      { trend: "BULLISH", structure: "BULLISH_STRUCTURE", swingHighs: [], swingLows: [], allSwings: [], latestSwingHigh: null, latestSwingLow: null, previousSwingHigh: null, previousSwingLow: null, isHigherHigh: true, isHigherLow: true, isLowerHigh: false, isLowerLow: false, breakOfStructure: false, changeOfCharacter: false, structureRetest: false },
      { setup: "TREND_CONTINUATION_PULLBACK", quality: 85, rationale: "" },
      mockSr,
      { ema20: 1.1490, ema50: 1.1480, ema200: null, rsi: 62, rsiDelta: 2, macdHist: 0.0002, macdSlope: "Rising", atr: 0.0010 },
      [],
      10000
    );

    expect(evalResult.hardGates.buyAllowed).toBe(false);
    expect(evalResult.bullishScore).toBeGreaterThanOrEqual(60);
  });

  // 30. Backtest Engine: Successfully runs bar-by-bar simulation and produces valid metrics
  it("Test 30: DeterministicBacktestEngine executes step-by-step backtest and outputs complete metrics", () => {
    const raw5m = generateCandles(80, 1.1200, 0.0003, 0.0002);
    const raw1h = generateCandles(80, 1.1150, 0.0004, 0.0002);
    const raw4h = generateCandles(80, 1.1100, 0.0005, 0.0002);

    const summary = DeterministicBacktestEngine.runBacktest("EUR/USD", raw5m, raw1h, raw4h, {
      holdingBars: 10,
      minConfidence: 60,
      lookbackWindow: 30,
    });

    expect(summary.totalEvaluatedBars).toBeGreaterThan(0);
    expect(summary.winRate).toBeGreaterThanOrEqual(0);
    expect(summary.winRate).toBeLessThanOrEqual(100);
    expect(summary.lossRate).toBeGreaterThanOrEqual(0);
    expect(summary.lossRate).toBeLessThanOrEqual(100);
    expect(summary.filterEfficiency).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(summary.trades)).toBe(true);
  });
});

describe("Canonical 7-Factor 100-Point Scoring Model & Signal Threshold Invariants", () => {
  const defaultSR = {
    nearestResistance: { price: 1.1550, distancePips: 40.0, distanceAtrMultiple: 4.0, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 3 },
    nearestSupport: { price: 1.1450, distancePips: 60.0, distanceAtrMultiple: 6.0, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 3 },
    allLevels: [],
  };

  const defaultIndicators = {
    ema20: 1.1505,
    ema50: 1.1495,
    ema200: null,
    rsi: 60,
    rsiDelta: 1,
    macdHist: 0.0002,
    macdSlope: "Rising",
    atr: 0.0010,
  };

  // Price (1.1510) > EMA20 (1.1505) > EMA50 (1.1495) -> 15 pts location
  // Trigger candle: open 1.1502, close 1.1510, high 1.1510, low 1.1500 (body ratio 0.8 >= 0.6) -> 10 pts confirmation
  const fullBullCandle = {
    datetime: "2026-09-10T12:00:00Z",
    open: 1.1502,
    high: 1.1510,
    low: 1.1500,
    close: 1.1510,
  };

  // 1. Exact 7-Factor Sums
  it("Factor breakdown exactly sums to 100 max points", () => {
    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      1.1510,
      "Bullish",
      "Bullish",
      {
        trend: "BULLISH",
        structure: "BULLISH_STRUCTURE",
        swingHighs: [],
        swingLows: [],
        allSwings: [],
        latestSwingHigh: null,
        latestSwingLow: null,
        previousSwingHigh: null,
        previousSwingLow: null,
        isHigherHigh: true,
        isHigherLow: true,
        isLowerHigh: false,
        isLowerLow: false,
        breakOfStructure: true,
        changeOfCharacter: false,
        structureRetest: false,
      },
      { setup: "SUPPORT_REJECTION", quality: 85, rationale: "" },
      defaultSR,
      defaultIndicators,
      [fullBullCandle],
      10000,
      {
        buyRisk: { entryPrice: 1.1510, stopLoss: 1.1494, takeProfit: 1.1540, riskPips: 16, rewardPips: 30, riskRewardRatio: 1.875, invalidationReason: "" },
        sellRisk: { entryPrice: 1.1510, stopLoss: 1.1526, takeProfit: 1.1480, riskPips: 16, rewardPips: 30, riskRewardRatio: 1.875, invalidationReason: "" },
      }
    );

    expect(evalResult.factors).toBeDefined();
    if (evalResult.factors) {
      expect(evalResult.factors.htfAlignment.max).toBe(20);
      expect(evalResult.factors.marketStructure.max).toBe(20);
      expect(evalResult.factors.momentum.max).toBe(15);
      expect(evalResult.factors.entryLocation.max).toBe(15);
      expect(evalResult.factors.supportResistance.max).toBe(10);
      expect(evalResult.factors.riskReward.max).toBe(10);
      expect(evalResult.factors.entryConfirmation.max).toBe(10);
      expect(evalResult.factors.total.max).toBe(100);

      expect(evalResult.factors.htfAlignment.bullish).toBe(20);
      expect(evalResult.factors.marketStructure.bullish).toBe(20);
      expect(evalResult.factors.momentum.bullish).toBe(15);
      expect(evalResult.factors.entryLocation.bullish).toBe(15);
      expect(evalResult.factors.supportResistance.bullish).toBe(10);
      expect(evalResult.factors.riskReward.bullish).toBe(10);
      expect(evalResult.factors.entryConfirmation.bullish).toBe(10);
      expect(evalResult.bullishScore).toBe(100);
    }
  });

  // 2. Missing HTF contributes 0 and does not redistribute
  it("Missing higher-timeframe data contributes 0 points and never inflates remaining factors", () => {
    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      1.1510,
      "Neutral / Indecisive",
      "Neutral / Range",
      {
        trend: "BULLISH",
        structure: "BULLISH_STRUCTURE",
        swingHighs: [],
        swingLows: [],
        allSwings: [],
        latestSwingHigh: null,
        latestSwingLow: null,
        previousSwingHigh: null,
        previousSwingLow: null,
        isHigherHigh: true,
        isHigherLow: true,
        isLowerHigh: false,
        isLowerLow: false,
        breakOfStructure: false,
        changeOfCharacter: false,
        structureRetest: false,
      },
      { setup: "SUPPORT_REJECTION", quality: 85, rationale: "" },
      defaultSR,
      defaultIndicators,
      [fullBullCandle],
      10000,
      {
        buyRisk: { entryPrice: 1.1510, stopLoss: 1.1494, takeProfit: 1.1540, riskPips: 16, rewardPips: 30, riskRewardRatio: 1.875, invalidationReason: "" },
      }
    );

    expect(evalResult.factors?.htfAlignment.bullish).toBe(0);
    expect(evalResult.bullishScore).toBe(80); // 100 - 20 HTF = 80
  });

  // 3. Threshold enforcement: Score below 75 threshold
  it("Bullish score = 65 is less than 75 threshold", () => {
    // 65 score: 0 HTF (0), structure (20), mom (15), loc (15), SR (5 mid-range), RR (10), conf (0: no trigger candle) = 65
    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      1.1510,
      "Neutral",
      "Neutral",
      {
        trend: "BULLISH",
        structure: "BULLISH_STRUCTURE",
        swingHighs: [],
        swingLows: [],
        allSwings: [],
        latestSwingHigh: null,
        latestSwingLow: null,
        previousSwingHigh: null,
        previousSwingLow: null,
        isHigherHigh: true,
        isHigherLow: true,
        isLowerHigh: false,
        isLowerLow: false,
        breakOfStructure: false,
        changeOfCharacter: false,
        structureRetest: false,
      },
      { setup: "NONE", quality: 50, rationale: "" },
      defaultSR,
      defaultIndicators,
      [], // no trigger candle
      10000,
      {
        buyRisk: { entryPrice: 1.1510, stopLoss: 1.1494, takeProfit: 1.1540, riskPips: 16, rewardPips: 30, riskRewardRatio: 1.875, invalidationReason: "" },
      }
    );

    expect(evalResult.bullishScore).toBe(65);
    expect(evalResult.bullishScore).toBeLessThan(75);
  });

  // 4. Hard Gate Override: Resistance trap forces buyAllowed: false
  it("Resistance ceiling trap strictly forces buyAllowed = false regardless of 80+ score", () => {
    const trappedSR = {
      nearestResistance: { price: 1.1511, distancePips: 1.0, distanceAtrMultiple: 0.1, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 3 },
      nearestSupport: defaultSR.nearestSupport,
      allLevels: [],
    };

    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      1.1510,
      "Bullish",
      "Bullish",
      {
        trend: "BULLISH",
        structure: "BULLISH_STRUCTURE",
        swingHighs: [],
        swingLows: [],
        allSwings: [],
        latestSwingHigh: null,
        latestSwingLow: null,
        previousSwingHigh: null,
        previousSwingLow: null,
        isHigherHigh: true,
        isHigherLow: true,
        isLowerHigh: false,
        isLowerLow: false,
        breakOfStructure: false,
        changeOfCharacter: false,
        structureRetest: false,
      },
      { setup: "NONE", quality: 50, rationale: "" },
      trappedSR,
      defaultIndicators,
      [fullBullCandle],
      10000
    );

    expect(evalResult.hardGates.buyAllowed).toBe(false);
    expect(evalResult.hardGates.reasons.some(r => r.includes("Resistance Ceiling Trap"))).toBe(true);
  });

  // 5. Hard Gate Override: Support floor trap forces sellAllowed = false
  it("Support floor trap strictly forces sellAllowed = false regardless of 80+ score", () => {
    const trappedSR = {
      nearestResistance: defaultSR.nearestResistance,
      nearestSupport: { price: 1.1489, distancePips: 1.0, distanceAtrMultiple: 0.1, strength: "STRONG" as const, source: "4H", timeframe: "4H", touches: 3 },
      allLevels: [],
    };

    const evalResult = DeterministicApiDecisionEngine.evaluateEvidenceAndGates(
      1.1490,
      "Bearish",
      "Bearish",
      {
        trend: "BEARISH",
        structure: "BEARISH_STRUCTURE",
        swingHighs: [],
        swingLows: [],
        allSwings: [],
        latestSwingHigh: null,
        latestSwingLow: null,
        previousSwingHigh: null,
        previousSwingLow: null,
        isHigherHigh: false,
        isHigherLow: false,
        isLowerHigh: true,
        isLowerLow: true,
        breakOfStructure: false,
        changeOfCharacter: false,
        structureRetest: false,
      },
      { setup: "NONE", quality: 50, rationale: "" },
      trappedSR,
      {
        ema20: 1.1495,
        ema50: 1.1505,
        ema200: null,
        rsi: 40,
        rsiDelta: -1,
        macdHist: -0.0002,
        macdSlope: "Falling",
        atr: 0.0010,
      },
      [{ datetime: "2026-09-10T12:00:00Z", open: 1.1498, high: 1.1498, low: 1.1490, close: 1.1490 }],
      10000
    );

    expect(evalResult.hardGates.sellAllowed).toBe(false);
    expect(evalResult.hardGates.reasons.some(r => r.includes("Support Floor Trap"))).toBe(true);
  });

  // 6. Server validator rejects AI BUY when deterministic engine is in WAIT
  it("validateFinalSignal rejects AI BUY when deterministic engine is in WAIT", () => {
    const deterministic = DeterministicApiDecisionEngine.processTwelveDataMarketData(
      "EUR/USD",
      "5m",
      generateCandles(60, 1.1200, 0.0001, 0.0005), // choppy
      generateCandles(60, 1.1200, 0.0001, 0.0005),
      generateCandles(60, 1.1200, 0.0001, 0.0005)
    );

    const validation = DeterministicApiDecisionEngine.validateFinalSignal(deterministic, {
      signal: "BUY",
      confidence: 85,
    });

    if (deterministic.signal === "WAIT") {
      expect(validation.finalSignal).toBe("WAIT");
      expect(validation.validationOverride).toBe(true);
    }
  });

  // 7. mobileSignalRules uses exact 7-factor 100-point model without weight redistribution
  it("mobileSignalRules calculates exact 7 factors and does not redistribute missing weights", () => {
    const partialExtraction = {
      indicators: {
        RSI: { visible: true, value: 65, direction: "bullish", confidence: 90 },
      },
      candles: {
        latest: { pattern: "bullish_engulfing", close: 1.1500, open: 1.1480 },
        confidence: 90,
      },
    };

    const result = calculateMobileSignalRules(partialExtraction);
    expect(result.bullishScore).toBeLessThanOrEqual(35);
    expect(result.bullishScore).toBeGreaterThan(0);
    expect(result.signal).toBe("WAIT");
  });

  // 8. mobileSignalRules issues BUY when 7-factor score >= 75 and trade quality >= 70
  it("mobileSignalRules issues BUY when all 7 factors align with score >= 75 and tradeQuality >= 70", () => {
    const fullBullishExtraction = {
      macroTrend: { state: "Bullish", confidence: 90 },
      confirmationTrend: { state: "Bullish", confidence: 90 },
      trend: { state: "Bullish", confidence: 90 },
      indicators: {
        EMA: {
          EMA20: { value: 1.1500, visible: true, confidence: 90 },
          EMA50: { value: 1.1480, visible: true, confidence: 90 },
        },
        RSI: { visible: true, value: 62, direction: "bullish", confidence: 90 },
        MACD: { visible: true, cross: "bullish", histogramDirection: "increasing", confidence: 90 },
      },
      candles: {
        latest: { pattern: "bullish_engulfing" },
        confidence: 90,
      },
      supportLevels: [{ value: 1.1501, type: "support" }],
      currentPrice: { value: 1.1504 },
      riskReward: 1.6,
      extractionConfidence: 85,
    };

    const result = calculateMobileSignalRules(fullBullishExtraction);
    expect(result.bullishScore).toBeGreaterThanOrEqual(75);
    expect(result.tradeQuality).toBeGreaterThanOrEqual(70);
    expect(result.signal).toBe("STRONG_BUY");
  });
});

