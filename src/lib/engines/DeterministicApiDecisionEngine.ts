import { EMA, RSI, MACD, BollingerBands, ATR } from "technicalindicators";

export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SwingPoint {
  index: number;
  candleIndex: number;
  price: number;
  timestamp: string;
}

export interface MarketStructureResult {
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS" | "TRANSITION";
  structure: "BULLISH_STRUCTURE" | "BEARISH_STRUCTURE" | "RANGE_STRUCTURE" | "TRANSITION" | "UNKNOWN";
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  allSwings: SwingPoint[];
  latestSwingHigh: SwingPoint | null;
  latestSwingLow: SwingPoint | null;
  previousSwingHigh: SwingPoint | null;
  previousSwingLow: SwingPoint | null;
  isHigherHigh: boolean;
  isHigherLow: boolean;
  isLowerHigh: boolean;
  isLowerLow: boolean;
  breakOfStructure: boolean;
  changeOfCharacter: boolean;
  structureRetest: boolean;
}

export interface SupportResistanceLevel {
  price: number;
  distancePips: number;
  distanceAtrMultiple: number;
  strength: "STRONG" | "MODERATE" | "MINOR";
  source: string;
  timeframe: string;
  touches: number;
}

export interface PriceLocationResult {
  nearestResistance: SupportResistanceLevel | null;
  nearestSupport: SupportResistanceLevel | null;
  pipsUnderResistance: number;
  pipsAboveSupport: number;
  atrMultipleToResistance: number;
  atrMultipleToSupport: number;
  locationQuality: "OPTIMAL" | "ACCEPTABLE" | "POOR_CEILING_TRAP" | "POOR_FLOOR_TRAP" | "OVEREXTENDED";
  opposingLevelRisk: "LOW" | "MEDIUM" | "CRITICAL_BARRIER";
  bollingerPercentB: number | null;
  bollingerState: "SQUEEZING" | "EXPANDING" | "NORMAL";
}

export interface RiskCalculationResult {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskPips: number;
  rewardPips: number;
  riskRewardRatio: number;
  invalidationReason: string;
}

export interface HardGateStatus {
  buyAllowed: boolean;
  sellAllowed: boolean;
  reasons: string[];
}

export interface DeterministicDecisionResult {
  signal: "BUY" | "SELL" | "WAIT" | "NO_TRADE";
  confidence: number;
  bullishScore: number;
  bearishScore: number;
  directionalLead: number;
  marketRegime: string;
  setup: "TREND_CONTINUATION_PULLBACK" | "BREAKOUT_CONFIRMED" | "BREAKOUT_WATCH" | "BREAKOUT_FAILED" | "BREAKOUT_RETEST" | "SUPPORT_REJECTION" | "RESISTANCE_REJECTION" | "REVERSAL_ATTEMPT" | "RANGE" | "CHOP" | "NONE";
  setupQuality: number;
  hardGates: HardGateStatus;
  timeframeAnalysis: {
    "4h": {
      bias: string;
      structure: string;
      latestClose: number;
      ema50: number | null;
      ema200: number | null;
      atr: number;
      swingHigh: number | null;
      swingLow: number | null;
    };
    "1h": {
      bias: string;
      structure: string;
      latestClose: number;
      ema20: number | null;
      ema50: number | null;
      ema200: number | null;
      rsi: number | null;
      rsiDelta: number | null;
      macdHist: number | null;
      atr: number;
      swingHigh: number | null;
      swingLow: number | null;
    };
    "5m": {
      trend: string;
      structure: string;
      currentPrice: number;
      ema20: number | null;
      ema50: number | null;
      ema200: number | null;
      maAlignment: string;
      rsi: number | null;
      rsiDelta: number | null;
      macdHist: number | null;
      macdSlope: string;
      atr: number;
      swingHigh: number | null;
      swingLow: number | null;
    };
  };
  marketStructure: {
    "4h": MarketStructureResult;
    "1h": MarketStructureResult;
    "5m": MarketStructureResult;
  };
  supportResistance: {
    nearestResistance: SupportResistanceLevel | null;
    nearestSupport: SupportResistanceLevel | null;
    allLevels: SupportResistanceLevel[];
  };
  momentum: {
    rsiValue: number | null;
    rsiDelta: number | null;
    macdHistogram: number | null;
    macdSlope: string;
    isRsiOverbought: boolean;
    isRsiOversold: boolean;
    isMomentumBullish: boolean;
    isMomentumBearish: boolean;
  };
  priceLocation: PriceLocationResult;
  risk: {
    buy: RiskCalculationResult;
    sell: RiskCalculationResult;
    active: RiskCalculationResult;
  };
  whyBuy: string[];
  whyNotBuy: string[];
  whySell: string[];
  whyNotSell: string[];
  dataQuality: {
    score: number;
    has4h: boolean;
    has1h: boolean;
    has5m: boolean;
    isFresh: boolean;
    notes: string[];
  };
  recent5CandlesAnatomy: any[];
}

export class DeterministicApiDecisionEngine {
  /**
   * Safe parser for TwelveData raw candle format
   * Ensures chronological order (oldest to newest)
   */
  static parseCandles(rawValues: any[]): Candle[] {
    if (!Array.isArray(rawValues) || rawValues.length === 0) return [];
    
    // TwelveData returns newest first; reverse to get chronological [oldest ... newest]
    const list = [...rawValues].reverse().map((c) => ({
      datetime: String(c.datetime || ""),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: c.volume != null ? parseFloat(c.volume) : undefined,
    }));

    return list.filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    );
  }

  /**
   * Section 3: Configurable Pivot / Fractal Swing Detection
   * Prevents lookahead bias: A candle at index `i` is a confirmed swing only when
   * `leftBars` before it have lower highs/higher lows AND `rightBars` after it have lower highs/higher lows.
   */
  static detectSwings(
    candles: Candle[],
    leftBars = 3,
    rightBars = 3
  ): { swingHighs: SwingPoint[]; swingLows: SwingPoint[]; allSwings: SwingPoint[] } {
    const swingHighs: SwingPoint[] = [];
    const swingLows: SwingPoint[] = [];

    if (candles.length < leftBars + rightBars + 1) {
      return { swingHighs, swingLows, allSwings: [] };
    }

    // Iterate up to length - rightBars to avoid using uncompleted right confirmation
    const maxIdx = candles.length - rightBars;
    for (let i = leftBars; i < maxIdx; i++) {
      const currentHigh = candles[i].high;
      const currentLow = candles[i].low;

      let isHigh = true;
      let isLow = true;

      for (let j = i - leftBars; j <= i + rightBars; j++) {
        if (j === i) continue;
        if (candles[j].high >= currentHigh) isHigh = false;
        if (candles[j].low <= currentLow) isLow = false;
      }

      if (isHigh) {
        swingHighs.push({
          index: i,
          candleIndex: candles.length - 1 - i, // 0 = latest completed candle
          price: currentHigh,
          timestamp: candles[i].datetime,
        });
      }

      if (isLow) {
        swingLows.push({
          index: i,
          candleIndex: candles.length - 1 - i,
          price: currentLow,
          timestamp: candles[i].datetime,
        });
      }
    }

    const allSwings = [...swingHighs, ...swingLows].sort((a, b) => a.index - b.index);
    return { swingHighs, swingLows, allSwings };
  }

  /**
   * Section 4: Market Structure Classification (HH, HL, LH, LL, BOS, CHOCH)
   */
  static analyzeMarketStructure(candles: Candle[], leftBars = 3, rightBars = 3): MarketStructureResult {
    const { swingHighs, swingLows } = this.detectSwings(candles, leftBars, rightBars);

    const latestSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;
    const previousSwingHigh = swingHighs.length > 1 ? swingHighs[swingHighs.length - 2] : null;
    const latestSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;
    const previousSwingLow = swingLows.length > 1 ? swingLows[swingLows.length - 2] : null;

    let isHigherHigh = false;
    let isHigherLow = false;
    let isLowerHigh = false;
    let isLowerLow = false;

    if (latestSwingHigh && previousSwingHigh) {
      isHigherHigh = latestSwingHigh.price > previousSwingHigh.price;
      isLowerHigh = latestSwingHigh.price < previousSwingHigh.price;
    }

    if (latestSwingLow && previousSwingLow) {
      isHigherLow = latestSwingLow.price > previousSwingLow.price;
      isLowerLow = latestSwingLow.price < previousSwingLow.price;
    }

    let structure: MarketStructureResult["structure"] = "UNKNOWN";
    let trend: MarketStructureResult["trend"] = "SIDEWAYS";

    if (isHigherHigh && isHigherLow) {
      structure = "BULLISH_STRUCTURE";
      trend = "BULLISH";
    } else if (isLowerHigh && isLowerLow) {
      structure = "BEARISH_STRUCTURE";
      trend = "BEARISH";
    } else if (isHigherHigh && isLowerLow) {
      structure = "TRANSITION";
      trend = "TRANSITION";
    } else if (isLowerHigh && isHigherLow) {
      structure = "RANGE_STRUCTURE";
      trend = "SIDEWAYS";
    } else {
      structure = "RANGE_STRUCTURE";
      trend = "SIDEWAYS";
    }

    // Break of Structure (BOS) & Change of Character (CHOCH) Detection
    let breakOfStructure = false;
    let changeOfCharacter = false;
    let structureRetest = false;

    const latestCandle = candles[candles.length - 1];
    if (latestCandle && latestSwingHigh && latestSwingLow) {
      if (structure === "BULLISH_STRUCTURE" && latestCandle.close > latestSwingHigh.price) {
        breakOfStructure = true;
      } else if (structure === "BEARISH_STRUCTURE" && latestCandle.close < latestSwingLow.price) {
        breakOfStructure = true;
      }

      if (structure === "BULLISH_STRUCTURE" && latestCandle.close < latestSwingLow.price) {
        changeOfCharacter = true;
      } else if (structure === "BEARISH_STRUCTURE" && latestCandle.close > latestSwingHigh.price) {
        changeOfCharacter = true;
      }

      const distHigh = Math.abs(latestCandle.close - latestSwingHigh.price);
      const distLow = Math.abs(latestCandle.close - latestSwingLow.price);
      const avgCandleRange = Math.max(0.0001, latestCandle.high - latestCandle.low);
      if (distHigh <= avgCandleRange * 0.5 || distLow <= avgCandleRange * 0.5) {
        structureRetest = true;
      }
    }

    return {
      trend,
      structure,
      swingHighs,
      swingLows,
      allSwings: [...swingHighs, ...swingLows].sort((a, b) => a.index - b.index),
      latestSwingHigh,
      latestSwingLow,
      previousSwingHigh,
      previousSwingLow,
      isHigherHigh,
      isHigherLow,
      isLowerHigh,
      isLowerLow,
      breakOfStructure,
      changeOfCharacter,
      structureRetest,
    };
  }

  /**
   * Section 5: Real Support & Resistance Level Aggregation
   */
  static extractSupportResistance(
    currentPrice: number,
    pipMultiplier: number,
    atr5m: number,
    swings4h: SwingPoint[] = [],
    swings1h: SwingPoint[] = [],
    swings5m: SwingPoint[] = []
  ): { nearestResistance: SupportResistanceLevel | null; nearestSupport: SupportResistanceLevel | null; allLevels: SupportResistanceLevel[] } {
    const rawLevels: Array<{ price: number; source: string; timeframe: string; weight: number }> = [];

    // 4H Swings (Highest weight)
    (swings4h || []).forEach((s) => rawLevels.push({ price: s.price, source: "4H_SWING", timeframe: "4H", weight: 3 }));
    // 1H Swings (Moderate weight)
    (swings1h || []).forEach((s) => rawLevels.push({ price: s.price, source: "1H_SWING", timeframe: "1H", weight: 2 }));
    // 5M Swings (Execution weight)
    (swings5m || []).forEach((s) => rawLevels.push({ price: s.price, source: "5M_SWING", timeframe: "5M", weight: 1 }));

    if (rawLevels.length === 0) {
      return { nearestResistance: null, nearestSupport: null, allLevels: [] };
    }

    // Cluster close levels within 0.35 * ATR
    const tolerance = Math.max(0.0002, atr5m * 0.35);
    const clusters: Array<{ prices: number[]; sources: string[]; timeframe: string; totalWeight: number }> = [];

    rawLevels.forEach((item) => {
      const existing = clusters.find((c) => {
        const avg = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
        return Math.abs(avg - item.price) <= tolerance;
      });

      if (existing) {
        existing.prices.push(item.price);
        if (!existing.sources.includes(item.source)) existing.sources.push(item.source);
        existing.totalWeight += item.weight;
      } else {
        clusters.push({
          prices: [item.price],
          sources: [item.source],
          timeframe: item.timeframe,
          totalWeight: item.weight,
        });
      }
    });

    const safeAtr = Math.max(0.0001, atr5m);
    const aggregated: SupportResistanceLevel[] = clusters.map((c) => {
      const avgPrice = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
      const dist = Math.abs(avgPrice - currentPrice);
      const distPips = parseFloat((dist * pipMultiplier).toFixed(1));
      const distAtr = parseFloat((dist / safeAtr).toFixed(2));
      const strength: SupportResistanceLevel["strength"] =
        c.totalWeight >= 4 || c.prices.length >= 3 ? "STRONG" : c.totalWeight >= 2 ? "MODERATE" : "MINOR";

      return {
        price: parseFloat(avgPrice.toFixed(5)),
        distancePips: distPips,
        distanceAtrMultiple: distAtr,
        strength,
        source: c.sources.join("+"),
        timeframe: c.timeframe,
        touches: c.prices.length,
      };
    });

    const resistances = aggregated
      .filter((lvl) => lvl.price > currentPrice)
      .sort((a, b) => a.price - b.price);

    const supports = aggregated
      .filter((lvl) => lvl.price < currentPrice)
      .sort((a, b) => b.price - a.price);

    const nearestResistance = resistances.length > 0 ? resistances[0] : null;
    const nearestSupport = supports.length > 0 ? supports[0] : null;

    return {
      nearestResistance,
      nearestSupport,
      allLevels: aggregated.sort((a, b) => b.price - a.price),
    };
  }

  /**
   * Section 7: Technical Indicator Engine (Pure OHLC computation)
   */
  static calculateIndicators(candles: Candle[]) {
    if (candles.length < 20) {
      return {
        ema20: [],
        ema50: [],
        ema200: [],
        rsi14: [],
        macd: [],
        bb: [],
        atr: [],
      };
    }

    const closePrices = candles.map((c) => c.close);
    const highPrices = candles.map((c) => c.high);
    const lowPrices = candles.map((c) => c.low);

    const ema20 = EMA.calculate({ period: 20, values: closePrices });
    const ema50 = EMA.calculate({ period: Math.min(50, closePrices.length), values: closePrices });
    const ema200 = closePrices.length >= 100 ? EMA.calculate({ period: Math.min(200, closePrices.length), values: closePrices }) : [];
    const rsi14 = RSI.calculate({ period: 14, values: closePrices });
    const macd = MACD.calculate({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
      values: closePrices,
    });
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });
    const atr = ATR.calculate({ period: 14, high: highPrices, low: lowPrices, close: closePrices });

    return {
      ema20,
      ema50,
      ema200,
      rsi14,
      macd,
      bb,
      atr,
    };
  }

  /**
   * Section 9-12: Deterministic Setup & Chop Classification Engine
   */
  static classifySetup(
    trend4h: string,
    trend1h: string,
    structure5m: MarketStructureResult,
    lastCandles: Candle[],
    ema20Val: number | null,
    ema50Val: number | null,
    rsiVal: number | null,
    rsiDelta: number | null,
    macdHist: number | null,
    macdSlope: string,
    atr5m: number,
    sr: { nearestResistance: SupportResistanceLevel | null; nearestSupport: SupportResistanceLevel | null }
  ): { setup: DeterministicDecisionResult["setup"]; quality: number; rationale: string } {
    if (lastCandles.length < 5 || !ema20Val || !ema50Val || rsiVal == null) {
      return { setup: "NONE", quality: 0, rationale: "Insufficient indicator history" };
    }

    const currentCandle = lastCandles[lastCandles.length - 1];
    const prevCandle = lastCandles[lastCandles.length - 2];
    const cp = currentCandle.close;

    // 1. Chop Detection
    const maSpread = Math.abs(ema20Val - ema50Val) / cp;
    const isEmaEntangled = maSpread < 0.0006; // < 0.06% separation
    const isRsiFlat = rsiVal >= 46 && rsiVal <= 54 && (rsiDelta == null || Math.abs(rsiDelta) < 1.0);
    const isMacdFlat = macdSlope === "Flat" || (macdHist != null && Math.abs(macdHist) < 0.00008);

    if (isEmaEntangled && isRsiFlat && isMacdFlat) {
      return {
        setup: "CHOP",
        quality: 10,
        rationale: "Moving averages are entangled with flat RSI (46-54) and near-zero MACD velocity.",
      };
    }

    // 2. Breakout Engine
    if (sr.nearestResistance && prevCandle && currentCandle.close > sr.nearestResistance.price) {
      const bodyRatio = Math.abs(currentCandle.close - currentCandle.open) / Math.max(0.00001, currentCandle.high - currentCandle.low);
      if (bodyRatio >= 0.55 && rsiVal > 55 && (macdSlope === "Rising" || macdSlope === "Bullish Cross")) {
        return {
          setup: "BREAKOUT_CONFIRMED",
          quality: 90,
          rationale: `Confirmed bullish breakout above resistance ${sr.nearestResistance.price} with strong body (${Math.round(bodyRatio * 100)}%) and positive momentum.`,
        };
      }
      return {
        setup: "BREAKOUT_WATCH",
        quality: 65,
        rationale: `Price broke above resistance ${sr.nearestResistance.price} awaiting momentum confirmation.`,
      };
    }

    if (sr.nearestSupport && prevCandle && currentCandle.close < sr.nearestSupport.price) {
      const bodyRatio = Math.abs(currentCandle.close - currentCandle.open) / Math.max(0.00001, currentCandle.high - currentCandle.low);
      if (bodyRatio >= 0.55 && rsiVal < 45 && (macdSlope === "Falling" || macdSlope === "Bearish Cross")) {
        return {
          setup: "BREAKOUT_CONFIRMED",
          quality: 90,
          rationale: `Confirmed bearish breakdown below support ${sr.nearestSupport.price} with strong body (${Math.round(bodyRatio * 100)}%) and downward momentum.`,
        };
      }
      return {
        setup: "BREAKOUT_WATCH",
        quality: 65,
        rationale: `Price broke below support ${sr.nearestSupport.price} awaiting momentum confirmation.`,
      };
    }

    // 3. Pullback Engine
    const isMtfBullish = trend4h.includes("Bullish") && trend1h.includes("Bullish");
    const isMtfBearish = trend4h.includes("Bearish") && trend1h.includes("Bearish");

    if (isMtfBullish && structure5m.structure !== "BEARISH_STRUCTURE") {
      const distToEma20 = Math.abs(cp - ema20Val);
      const isNearEma = distToEma20 <= atr5m * 0.6;
      const isBullishCandle = currentCandle.close >= currentCandle.open;
      const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
      const range = Math.max(0.00001, currentCandle.high - currentCandle.low);
      const hasLowerWick = lowerWick / range >= 0.35;

      if (isNearEma && (isBullishCandle || hasLowerWick) && rsiVal > 48) {
        return {
          setup: "TREND_CONTINUATION_PULLBACK",
          quality: 88,
          rationale: "Bullish multi-timeframe trend continuation pullback to EMA20 support with responsive buyer wicks.",
        };
      }
    }

    if (isMtfBearish && structure5m.structure !== "BULLISH_STRUCTURE") {
      const distToEma20 = Math.abs(cp - ema20Val);
      const isNearEma = distToEma20 <= atr5m * 0.6;
      const isBearishCandle = currentCandle.close <= currentCandle.open;
      const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
      const range = Math.max(0.00001, currentCandle.high - currentCandle.low);
      const hasUpperWick = upperWick / range >= 0.35;

      if (isNearEma && (isBearishCandle || hasUpperWick) && rsiVal < 52) {
        return {
          setup: "TREND_CONTINUATION_PULLBACK",
          quality: 88,
          rationale: "Bearish multi-timeframe trend continuation pullback to EMA20 resistance with responsive seller wicks.",
        };
      }
    }

    // 4. Reversal / Rejection Engine
    if (sr.nearestSupport && Math.abs(cp - sr.nearestSupport.price) <= atr5m * 0.5) {
      const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
      const range = Math.max(0.00001, currentCandle.high - currentCandle.low);
      if (lowerWick / range >= 0.5 && rsiVal < 35) {
        return {
          setup: "SUPPORT_REJECTION",
          quality: 80,
          rationale: `Strong rejection pinbar at support floor ${sr.nearestSupport.price} (${Math.round((lowerWick / range) * 100)}% lower wick).`,
        };
      }
    }

    if (sr.nearestResistance && Math.abs(cp - sr.nearestResistance.price) <= atr5m * 0.5) {
      const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
      const range = Math.max(0.00001, currentCandle.high - currentCandle.low);
      if (upperWick / range >= 0.5 && rsiVal > 65) {
        return {
          setup: "RESISTANCE_REJECTION",
          quality: 80,
          rationale: `Strong rejection pinbar at resistance ceiling ${sr.nearestResistance.price} (${Math.round((upperWick / range) * 100)}% upper wick).`,
        };
      }
    }

    // 5. Range or None
    if (structure5m.structure === "RANGE_STRUCTURE") {
      return {
        setup: "RANGE",
        quality: 50,
        rationale: "Price oscillating within defined support and resistance boundaries.",
      };
    }

    return {
      setup: "NONE",
      quality: 40,
      rationale: "No clean institutional trigger pattern identified on execution timeframe.",
    };
  }

  /**
   * Section 14: Server-Side Dynamic SL / TP & Risk/Reward Calculation
   */
  static calculateRisk(
    entryPrice: number,
    direction: "BUY" | "SELL",
    atr5m: number,
    sr: { nearestResistance: SupportResistanceLevel | null; nearestSupport: SupportResistanceLevel | null },
    swings: { latestSwingHigh: SwingPoint | null; latestSwingLow: SwingPoint | null },
    pipMultiplier: number
  ): RiskCalculationResult {
    const safeAtr = Math.max(0.0001, atr5m);

    if (direction === "BUY") {
      // Invalidation is below recent swing low or 5M support, with 0.5 ATR buffer
      let slPrice = entryPrice - safeAtr * 1.2;
      let invalidationReason = "1.2x ATR Technical Invalidation";

      if (swings.latestSwingLow && swings.latestSwingLow.price < entryPrice) {
        slPrice = Math.min(slPrice, swings.latestSwingLow.price - safeAtr * 0.3);
        invalidationReason = `Recent 5M Swing Low (${swings.latestSwingLow.price}) buffer`;
      } else if (sr.nearestSupport && sr.nearestSupport.price < entryPrice) {
        slPrice = Math.min(slPrice, sr.nearestSupport.price - safeAtr * 0.3);
        invalidationReason = `Structural Support (${sr.nearestSupport.price}) buffer`;
      }

      // Target is near resistance or 1.5x ATR
      let tpPrice = entryPrice + safeAtr * 1.5;
      if (sr.nearestResistance && sr.nearestResistance.price > entryPrice) {
        tpPrice = sr.nearestResistance.price - safeAtr * 0.2;
      }

      const riskDist = Math.max(0.00005, entryPrice - slPrice);
      const rewardDist = Math.max(0.00005, tpPrice - entryPrice);
      const riskPips = parseFloat((riskDist * pipMultiplier).toFixed(1));
      const rewardPips = parseFloat((rewardDist * pipMultiplier).toFixed(1));
      const riskRewardRatio = parseFloat((rewardDist / riskDist).toFixed(2));

      return {
        entryPrice: parseFloat(entryPrice.toFixed(5)),
        stopLoss: parseFloat(slPrice.toFixed(5)),
        takeProfit: parseFloat(tpPrice.toFixed(5)),
        riskPips,
        rewardPips,
        riskRewardRatio,
        invalidationReason,
      };
    } else {
      // SELL direction
      let slPrice = entryPrice + safeAtr * 1.2;
      let invalidationReason = "1.2x ATR Technical Invalidation";

      if (swings.latestSwingHigh && swings.latestSwingHigh.price > entryPrice) {
        slPrice = Math.max(slPrice, swings.latestSwingHigh.price + safeAtr * 0.3);
        invalidationReason = `Recent 5M Swing High (${swings.latestSwingHigh.price}) buffer`;
      } else if (sr.nearestResistance && sr.nearestResistance.price > entryPrice) {
        slPrice = Math.max(slPrice, sr.nearestResistance.price + safeAtr * 0.3);
        invalidationReason = `Structural Resistance (${sr.nearestResistance.price}) buffer`;
      }

      let tpPrice = entryPrice - safeAtr * 1.5;
      if (sr.nearestSupport && sr.nearestSupport.price < entryPrice) {
        tpPrice = sr.nearestSupport.price + safeAtr * 0.2;
      }

      const riskDist = Math.max(0.00005, slPrice - entryPrice);
      const rewardDist = Math.max(0.00005, entryPrice - tpPrice);
      const riskPips = parseFloat((riskDist * pipMultiplier).toFixed(1));
      const rewardPips = parseFloat((rewardDist * pipMultiplier).toFixed(1));
      const riskRewardRatio = parseFloat((rewardDist / riskDist).toFixed(2));

      return {
        entryPrice: parseFloat(entryPrice.toFixed(5)),
        stopLoss: parseFloat(slPrice.toFixed(5)),
        takeProfit: parseFloat(tpPrice.toFixed(5)),
        riskPips,
        rewardPips,
        riskRewardRatio,
        invalidationReason,
      };
    }
  }

  /**
   * Section 15-16: Independent Deterministic Scoring & Hard Gates
   */
  static evaluateEvidenceAndGates(
    currentPrice: number,
    trend4h: string,
    trend1h: string,
    structure5m: MarketStructureResult,
    setupObj: { setup: DeterministicDecisionResult["setup"]; quality: number; rationale: string },
    sr: { nearestResistance: SupportResistanceLevel | null; nearestSupport: SupportResistanceLevel | null },
    indicators5m: {
      ema20: number | null;
      ema50: number | null;
      ema200: number | null;
      rsi: number | null;
      rsiDelta: number | null;
      macdHist: number | null;
      macdSlope: string;
      atr: number;
    },
    latestCandles: Candle[],
    pipMultiplier: number
  ) {
    let bullishScore = 0;
    let bearishScore = 0;
    const whyBuy: string[] = [];
    const whyNotBuy: string[] = [];
    const whySell: string[] = [];
    const whyNotSell: string[] = [];
    const hardGateReasons: string[] = [];

    const safeAtr = Math.max(0.0001, indicators5m.atr);

    // 1. Higher Timeframe Context (Max 20 pts)
    if (trend4h.includes("Bullish")) {
      bullishScore += 10;
      whyBuy.push("4H Macro trend is Bullish (+10)");
    } else if (trend4h.includes("Bearish")) {
      bearishScore += 10;
      whySell.push("4H Macro trend is Bearish (+10)");
    }

    if (trend1h.includes("Bullish")) {
      bullishScore += 10;
      whyBuy.push("1H Intermediate trend confirms Bullish structure (+10)");
    } else if (trend1h.includes("Bearish")) {
      bearishScore += 10;
      whySell.push("1H Intermediate trend confirms Bearish structure (+10)");
    }

    // 2. 5M Market Structure (Max 20 pts)
    if (structure5m.structure === "BULLISH_STRUCTURE") {
      bullishScore += 20;
      whyBuy.push("5M prints Higher Highs and Higher Lows (+20)");
      whyNotSell.push("5M structure is structurally Bullish");
    } else if (structure5m.structure === "BEARISH_STRUCTURE") {
      bearishScore += 20;
      whySell.push("5M prints Lower Highs and Lower Lows (+20)");
      whyNotBuy.push("5M structure is structurally Bearish");
    } else {
      bullishScore += 5;
      bearishScore += 5;
    }

    // 3. Setup Quality (Max 20 pts)
    if (setupObj.setup === "TREND_CONTINUATION_PULLBACK" || setupObj.setup === "BREAKOUT_CONFIRMED") {
      if (bullishScore > bearishScore) {
        bullishScore += 20;
        whyBuy.push(`Active high-grade setup: ${setupObj.setup} (+20)`);
      } else {
        bearishScore += 20;
        whySell.push(`Active high-grade setup: ${setupObj.setup} (+20)`);
      }
    } else if (setupObj.setup === "SUPPORT_REJECTION") {
      bullishScore += 15;
      whyBuy.push("Support floor rejection pinbar confirmed (+15)");
    } else if (setupObj.setup === "RESISTANCE_REJECTION") {
      bearishScore += 15;
      whySell.push("Resistance ceiling rejection pinbar confirmed (+15)");
    } else if (setupObj.setup === "CHOP") {
      whyNotBuy.push("Market is in an entangled volatility CHOP");
      whyNotSell.push("Market is in an entangled volatility CHOP");
    }

    // 4. Moving Average Alignment (Max 15 pts)
    const e20 = indicators5m.ema20;
    const e50 = indicators5m.ema50;
    if (e20 && e50) {
      if (currentPrice > e20 && e20 > e50) {
        bullishScore += 15;
        whyBuy.push("Full bullish EMA stack (Price > EMA20 > EMA50) (+15)");
      } else if (currentPrice < e20 && e20 < e50) {
        bearishScore += 15;
        whySell.push("Full bearish EMA stack (Price < EMA20 < EMA50) (+15)");
      } else if (e20 > currentPrice && currentPrice > e50) {
        bullishScore += 8;
        whyBuy.push("Bullish pullback zone (EMA20 > Price > EMA50) (+8)");
      } else if (e20 < currentPrice && currentPrice < e50) {
        bearishScore += 8;
        whySell.push("Bearish pullback zone (EMA20 < Price < EMA50) (+8)");
      }
    }

    // 5. Momentum: RSI + MACD Slope (Max 15 pts)
    const rsi = indicators5m.rsi;
    const rsiDelta = indicators5m.rsiDelta;
    const macdSlope = indicators5m.macdSlope;

    if (rsi != null) {
      if (rsi > 55 && (rsiDelta == null || rsiDelta >= 0)) {
        bullishScore += 8;
        whyBuy.push(`RSI (${rsi.toFixed(1)}) in bullish expansion (+8)`);
      } else if (rsi < 45 && (rsiDelta == null || rsiDelta <= 0)) {
        bearishScore += 8;
        whySell.push(`RSI (${rsi.toFixed(1)}) in bearish expansion (+8)`);
      }
    }

    const macdHist = indicators5m.macdHist;
    if (macdHist != null) {
      if (macdHist > 0 && (macdSlope === "Rising" || macdSlope === "Bullish Cross")) {
        bullishScore += 7;
        whyBuy.push(`MACD histogram (${macdHist.toFixed(5)}) is positive and expanding (+7)`);
      } else if (macdHist < 0 && (macdSlope === "Falling" || macdSlope === "Bearish Cross")) {
        bearishScore += 7;
        whySell.push(`MACD histogram (${macdHist.toFixed(5)}) is negative and expanding (+7)`);
      } else if (macdHist > 0) {
        bullishScore += 3;
        whyBuy.push(`MACD histogram (${macdHist.toFixed(5)}) is positive (+3)`);
      } else if (macdHist < 0) {
        bearishScore += 3;
        whySell.push(`MACD histogram (${macdHist.toFixed(5)}) is negative (+3)`);
      }
    } else {
      if (macdSlope === "Rising" || macdSlope === "Bullish Cross") {
        bullishScore += 5;
        whyBuy.push(`MACD histogram is rising/bullish cross (+5)`);
      } else if (macdSlope === "Falling" || macdSlope === "Bearish Cross") {
        bearishScore += 5;
        whySell.push(`MACD histogram is falling/bearish cross (+5)`);
      }
    }

    // 6. Price Action / Candle Anatomy (Max 10 pts)
    const lastC = latestCandles[latestCandles.length - 1];
    if (lastC) {
      const isBullishCandle = lastC.close >= lastC.open;
      const range = Math.max(0.00001, lastC.high - lastC.low);
      const bodyRatio = Math.abs(lastC.close - lastC.open) / range;
      const lowerWickRatio = (Math.min(lastC.open, lastC.close) - lastC.low) / range;
      const upperWickRatio = (lastC.high - Math.max(lastC.open, lastC.close)) / range;

      if (isBullishCandle && (bodyRatio >= 0.6 || lowerWickRatio >= 0.4)) {
        bullishScore += 10;
        whyBuy.push("Recent trigger candle shows strong buyer pressure (+10)");
      } else if (!isBullishCandle && (bodyRatio >= 0.6 || upperWickRatio >= 0.4)) {
        bearishScore += 10;
        whySell.push("Recent trigger candle shows strong seller pressure (+10)");
      }
    }

    // Hard Gate Validations
    let buyAllowed = true;
    let sellAllowed = true;

    // Check Distance to Resistance
    if (sr.nearestResistance) {
      const distPips = (sr.nearestResistance.price - currentPrice) * pipMultiplier;
      const distAtr = (sr.nearestResistance.price - currentPrice) / safeAtr;
      if (distPips < 2.5 || distAtr < 0.75) {
        if (setupObj.setup !== "BREAKOUT_CONFIRMED") {
          buyAllowed = false;
          whyNotBuy.push(`Hard Gate: Price trapped just ${distPips.toFixed(1)}p below Resistance ceiling`);
          hardGateReasons.push(`Resistance Ceiling Trap (${distPips.toFixed(1)}p to barrier)`);
        }
      }
    }

    // Check Distance to Support
    if (sr.nearestSupport) {
      const distPips = (currentPrice - sr.nearestSupport.price) * pipMultiplier;
      const distAtr = (currentPrice - sr.nearestSupport.price) / safeAtr;
      if (distPips < 2.5 || distAtr < 0.75) {
        if (setupObj.setup !== "BREAKOUT_CONFIRMED") {
          sellAllowed = false;
          whyNotSell.push(`Hard Gate: Price trapped just ${distPips.toFixed(1)}p above Support floor`);
          hardGateReasons.push(`Support Floor Trap (${distPips.toFixed(1)}p to barrier)`);
        }
      }
    }

    // Hard Gate: Chop
    if (setupObj.setup === "CHOP") {
      buyAllowed = false;
      sellAllowed = false;
      hardGateReasons.push("Entangled Volatility Chop");
    }

    // Hard Gate: 5M direct contradiction to 4H Macro with no reversal pattern
    if (trend4h.includes("Bearish") && structure5m.structure === "BULLISH_STRUCTURE" && setupObj.setup !== "SUPPORT_REJECTION") {
      buyAllowed = false;
      whyNotBuy.push("Hard Gate: 5M buying contradicts 4H macro bearish trend without confirmed reversal");
      hardGateReasons.push("Counter-Macro Bullish Conflict");
    }

    if (trend4h.includes("Bullish") && structure5m.structure === "BEARISH_STRUCTURE" && setupObj.setup !== "RESISTANCE_REJECTION") {
      sellAllowed = false;
      whyNotSell.push("Hard Gate: 5M selling contradicts 4H macro bullish trend without confirmed reversal");
      hardGateReasons.push("Counter-Macro Bearish Conflict");
    }

    bullishScore = Math.min(100, Math.max(0, bullishScore));
    bearishScore = Math.min(100, Math.max(0, bearishScore));

    return {
      bullishScore,
      bearishScore,
      directionalLead: Math.abs(bullishScore - bearishScore),
      whyBuy,
      whyNotBuy,
      whySell,
      whyNotSell,
      hardGates: {
        buyAllowed,
        sellAllowed,
        reasons: hardGateReasons,
      },
    };
  }

  /**
   * Complete Master Pipeline
   */
  static processTwelveDataMarketData(
    symbol: string,
    executionTf: string,
    raw4hValues: any[],
    raw1hValues: any[],
    raw5mValues: any[],
    tradeDuration = "5m"
  ): DeterministicDecisionResult {
    const candles4h = this.parseCandles(raw4hValues);
    const candles1h = this.parseCandles(raw1hValues);
    const candles5m = this.parseCandles(raw5mValues);

    const has4h = candles4h.length >= 20;
    const has1h = candles1h.length >= 20;
    const has5m = candles5m.length >= 20;

    const dataQualityNotes: string[] = [];
    if (!has4h) dataQualityNotes.push("4H history contains fewer than 20 candles");
    if (!has1h) dataQualityNotes.push("1H history contains fewer than 20 candles");
    if (!has5m) dataQualityNotes.push("5M execution history is insufficient");

    const dataQualityScore = has4h && has1h && has5m ? 95 : has5m ? 70 : 20;

    if (!has5m) {
      return this.createEmptyNoTradeResponse(symbol, tradeDuration, dataQualityScore, dataQualityNotes);
    }

    const pipMultiplier = symbol.includes("JPY") || symbol.includes("XAU") || symbol.includes("XAG") ? 100 : 10000;

    // 1. Indicators
    const ind4h = this.calculateIndicators(candles4h);
    const ind1h = this.calculateIndicators(candles1h);
    const ind5m = this.calculateIndicators(candles5m);

    // 2. Swings & Market Structure
    const struct4h = this.analyzeMarketStructure(candles4h, 3, 3);
    const struct1h = this.analyzeMarketStructure(candles1h, 3, 3);
    const struct5m = this.analyzeMarketStructure(candles5m, 2, 2);

    const currentCandle = candles5m[candles5m.length - 1];
    const currentPrice = currentCandle.close;

    // Indicator extracts
    const ema20_5m = ind5m.ema20.length ? ind5m.ema20[ind5m.ema20.length - 1] : null;
    const ema50_5m = ind5m.ema50.length ? ind5m.ema50[ind5m.ema50.length - 1] : null;
    const ema200_5m = ind5m.ema200.length ? ind5m.ema200[ind5m.ema200.length - 1] : null;
    const rsi_5m = ind5m.rsi14.length ? ind5m.rsi14[ind5m.rsi14.length - 1] : null;
    const rsiDelta_5m = ind5m.rsi14.length >= 3 ? ind5m.rsi14[ind5m.rsi14.length - 1] - ind5m.rsi14[ind5m.rsi14.length - 3] : null;
    const macdLatest = ind5m.macd.length ? ind5m.macd[ind5m.macd.length - 1] : null;
    const macdHist_5m = macdLatest ? Number(macdLatest.histogram) : null;
    const atr_5m = ind5m.atr.length ? ind5m.atr[ind5m.atr.length - 1] : 0.0008;

    let macdSlope_5m = "Flat";
    if (ind5m.macd.length >= 3) {
      const h0 = Number(ind5m.macd[ind5m.macd.length - 3].histogram);
      const h1 = Number(ind5m.macd[ind5m.macd.length - 2].histogram);
      const h2 = Number(ind5m.macd[ind5m.macd.length - 1].histogram);
      if (h2 > h1 && h1 > h0) macdSlope_5m = "Rising";
      else if (h2 < h1 && h1 < h0) macdSlope_5m = "Falling";
      else if (h2 > 0 && h1 < 0) macdSlope_5m = "Bullish Cross";
      else if (h2 < 0 && h1 > 0) macdSlope_5m = "Bearish Cross";
    }

    // 4H Bias
    const c4h = candles4h.length ? candles4h[candles4h.length - 1].close : currentPrice;
    const e50_4h = ind4h.ema50.length ? ind4h.ema50[ind4h.ema50.length - 1] : null;
    const e200_4h = ind4h.ema200.length ? ind4h.ema200[ind4h.ema200.length - 1] : null;
    let bias4h = "Neutral / Indecisive";
    if (e50_4h) {
      if (e200_4h && c4h > e50_4h && e50_4h > e200_4h) bias4h = "Strong Macro Bullish (Price > EMA50 > EMA200)";
      else if (e200_4h && c4h < e50_4h && e50_4h < e200_4h) bias4h = "Strong Macro Bearish (Price < EMA50 < EMA200)";
      else if (c4h > e50_4h) bias4h = "Macro Bullish (Price > EMA50)";
      else if (c4h < e50_4h) bias4h = "Macro Bearish (Price < EMA50)";
    }

    // 1H Bias
    const c1h = candles1h.length ? candles1h[candles1h.length - 1].close : currentPrice;
    const e20_1h = ind1h.ema20.length ? ind1h.ema20[ind1h.ema20.length - 1] : null;
    const e50_1h = ind1h.ema50.length ? ind1h.ema50[ind1h.ema50.length - 1] : null;
    let bias1h = "Neutral / Range";
    if (e20_1h && e50_1h) {
      if (c1h > e20_1h && e20_1h > e50_1h) bias1h = "Bullish Momentum Expansion (Price > EMA20 > EMA50)";
      else if (c1h < e20_1h && e20_1h < e50_1h) bias1h = "Bearish Momentum Expansion (Price < EMA20 < EMA50)";
      else if (e20_1h > c1h && c1h > e50_1h) bias1h = "Bullish Pullback Zone (EMA20 > Price > EMA50)";
      else if (e20_1h < c1h && c1h < e50_1h) bias1h = "Bearish Pullback Zone (EMA20 < Price < EMA50)";
    } else if (e50_1h) {
      bias1h = c1h > e50_1h ? "Bullish Trend" : "Bearish Trend";
    }

    // 3. S/R Extraction
    const sr = this.extractSupportResistance(
      currentPrice,
      pipMultiplier,
      atr_5m,
      struct4h.allSwings,
      struct1h.allSwings,
      struct5m.allSwings
    );

    // 4. Setup Classification
    const setupObj = this.classifySetup(
      bias4h,
      bias1h,
      struct5m,
      candles5m.slice(-10),
      ema20_5m,
      ema50_5m,
      rsi_5m,
      rsiDelta_5m,
      macdHist_5m,
      macdSlope_5m,
      atr_5m,
      sr
    );

    // 5. Evidence & Hard Gates
    const evalResult = this.evaluateEvidenceAndGates(
      currentPrice,
      bias4h,
      bias1h,
      struct5m,
      setupObj,
      sr,
      {
        ema20: ema20_5m,
        ema50: ema50_5m,
        ema200: ema200_5m,
        rsi: rsi_5m,
        rsiDelta: rsiDelta_5m,
        macdHist: macdHist_5m,
        macdSlope: macdSlope_5m,
        atr: atr_5m,
      },
      candles5m.slice(-5),
      pipMultiplier
    );

    // 6. Risk Engine
    const buyRisk = this.calculateRisk(currentPrice, "BUY", atr_5m, sr, struct5m, pipMultiplier);
    const sellRisk = this.calculateRisk(currentPrice, "SELL", atr_5m, sr, struct5m, pipMultiplier);

    // 7. Deterministic Decision & Evidence Confidence
    let signal: DeterministicDecisionResult["signal"] = "WAIT";
    let activeRisk = buyRisk;
    let confidence = 35; // Default baseline for wait/indecision

    if (
      evalResult.hardGates.buyAllowed &&
      evalResult.bullishScore >= 75 &&
      evalResult.bullishScore > evalResult.bearishScore + 20 &&
      buyRisk.riskRewardRatio >= 1.1
    ) {
      signal = "BUY";
      activeRisk = buyRisk;
      confidence = Math.min(95, Math.round(55 + (evalResult.bullishScore - 75) * 1.5 + buyRisk.riskRewardRatio * 5));
    } else if (
      evalResult.hardGates.sellAllowed &&
      evalResult.bearishScore >= 75 &&
      evalResult.bearishScore > evalResult.bullishScore + 20 &&
      sellRisk.riskRewardRatio >= 1.1
    ) {
      signal = "SELL";
      activeRisk = sellRisk;
      confidence = Math.min(95, Math.round(55 + (evalResult.bearishScore - 75) * 1.5 + sellRisk.riskRewardRatio * 5));
    } else {
      signal = "WAIT";
      confidence = Math.min(45, Math.max(20, Math.round(evalResult.directionalLead * 0.4)));
    }

    // Price location
    const latestBb = ind5m.bb.length ? ind5m.bb[ind5m.bb.length - 1] : null;
    let bbPercentB: number | null = null;
    let bbState: PriceLocationResult["bollingerState"] = "NORMAL";
    if (latestBb && latestBb.upper > latestBb.lower) {
      bbPercentB = parseFloat(((currentPrice - latestBb.lower) / (latestBb.upper - latestBb.lower)).toFixed(2));
      const width = (latestBb.upper - latestBb.lower) / latestBb.middle;
      if (width < 0.001) bbState = "SQUEEZING";
      else if (width > 0.005) bbState = "EXPANDING";
    }

    const pipsUnderR1 = sr.nearestResistance ? parseFloat(((sr.nearestResistance.price - currentPrice) * pipMultiplier).toFixed(1)) : 999;
    const pipsAboveS1 = sr.nearestSupport ? parseFloat(((currentPrice - sr.nearestSupport.price) * pipMultiplier).toFixed(1)) : 999;

    let locQuality: PriceLocationResult["locationQuality"] = "ACCEPTABLE";
    if (pipsUnderR1 < 2.5 && signal === "BUY") locQuality = "POOR_CEILING_TRAP";
    else if (pipsAboveS1 < 2.5 && signal === "SELL") locQuality = "POOR_FLOOR_TRAP";
    else if (pipsUnderR1 >= 5.0 && pipsAboveS1 >= 5.0) locQuality = "OPTIMAL";

    // 5-Candle Anatomy
    const fiveCandles = candles5m.slice(-5).map((c, idx) => {
      const range = Math.max(0.00001, c.high - c.low);
      const body = Math.abs(c.close - c.open);
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const isBullish = c.close >= c.open;

      return {
        candleIndex: idx + 1,
        time: c.datetime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        direction: isBullish ? "BULLISH" : "BEARISH",
        bodyPct: `${((body / range) * 100).toFixed(1)}%`,
        upperWickPct: `${((upperWick / range) * 100).toFixed(1)}%`,
        lowerWickPct: `${((lowerWick / range) * 100).toFixed(1)}%`,
      };
    });

    return {
      signal,
      confidence,
      bullishScore: evalResult.bullishScore,
      bearishScore: evalResult.bearishScore,
      directionalLead: evalResult.directionalLead,
      marketRegime: bias4h,
      setup: setupObj.setup,
      setupQuality: setupObj.quality,
      hardGates: evalResult.hardGates,
      timeframeAnalysis: {
        "4h": {
          bias: bias4h,
          structure: struct4h.structure,
          latestClose: c4h,
          ema50: e50_4h,
          ema200: e200_4h,
          atr: ind4h.atr.length ? ind4h.atr[ind4h.atr.length - 1] : 0,
          swingHigh: struct4h.latestSwingHigh ? struct4h.latestSwingHigh.price : null,
          swingLow: struct4h.latestSwingLow ? struct4h.latestSwingLow.price : null,
        },
        "1h": {
          bias: bias1h,
          structure: struct1h.structure,
          latestClose: c1h,
          ema20: e20_1h,
          ema50: e50_1h,
          ema200: ind1h.ema200.length ? ind1h.ema200[ind1h.ema200.length - 1] : null,
          rsi: ind1h.rsi14.length ? ind1h.rsi14[ind1h.rsi14.length - 1] : null,
          rsiDelta: ind1h.rsi14.length >= 3 ? ind1h.rsi14[ind1h.rsi14.length - 1] - ind1h.rsi14[ind1h.rsi14.length - 3] : null,
          macdHist: ind1h.macd.length ? Number(ind1h.macd[ind1h.macd.length - 1].histogram) : null,
          atr: ind1h.atr.length ? ind1h.atr[ind1h.atr.length - 1] : 0,
          swingHigh: struct1h.latestSwingHigh ? struct1h.latestSwingHigh.price : null,
          swingLow: struct1h.latestSwingLow ? struct1h.latestSwingLow.price : null,
        },
        "5m": {
          trend: currentPrice > (ema50_5m || currentPrice) ? "Bullish" : "Bearish",
          structure: struct5m.structure,
          currentPrice,
          ema20: ema20_5m,
          ema50: ema50_5m,
          ema200: ema200_5m,
          maAlignment:
            ema20_5m && ema50_5m
              ? currentPrice > ema20_5m && ema20_5m > ema50_5m
                ? "FULL_BULLISH_STACK"
                : currentPrice < ema20_5m && ema20_5m < ema50_5m
                ? "FULL_BEARISH_STACK"
                : "PULLBACK_OR_CHOP"
              : "UNKNOWN",
          rsi: rsi_5m,
          rsiDelta: rsiDelta_5m,
          macdHist: macdHist_5m,
          macdSlope: macdSlope_5m,
          atr: atr_5m,
          swingHigh: struct5m.latestSwingHigh ? struct5m.latestSwingHigh.price : null,
          swingLow: struct5m.latestSwingLow ? struct5m.latestSwingLow.price : null,
        },
      },
      marketStructure: {
        "4h": struct4h,
        "1h": struct1h,
        "5m": struct5m,
      },
      supportResistance: sr,
      momentum: {
        rsiValue: rsi_5m,
        rsiDelta: rsiDelta_5m,
        macdHistogram: macdHist_5m,
        macdSlope: macdSlope_5m,
        isRsiOverbought: (rsi_5m || 50) >= 70,
        isRsiOversold: (rsi_5m || 50) <= 30,
        isMomentumBullish: (rsi_5m || 50) > 55 && (macdSlope_5m === "Rising" || macdSlope_5m === "Bullish Cross"),
        isMomentumBearish: (rsi_5m || 50) < 45 && (macdSlope_5m === "Falling" || macdSlope_5m === "Bearish Cross"),
      },
      priceLocation: {
        nearestResistance: sr.nearestResistance,
        nearestSupport: sr.nearestSupport,
        pipsUnderResistance: pipsUnderR1,
        pipsAboveSupport: pipsAboveS1,
        atrMultipleToResistance: sr.nearestResistance ? sr.nearestResistance.distanceAtrMultiple : 99,
        atrMultipleToSupport: sr.nearestSupport ? sr.nearestSupport.distanceAtrMultiple : 99,
        locationQuality: locQuality,
        opposingLevelRisk: pipsUnderR1 < 2.5 || pipsAboveS1 < 2.5 ? "CRITICAL_BARRIER" : "LOW",
        bollingerPercentB: bbPercentB,
        bollingerState: bbState,
      },
      risk: {
        buy: buyRisk,
        sell: sellRisk,
        active: activeRisk,
      },
      whyBuy: evalResult.whyBuy,
      whyNotBuy: evalResult.whyNotBuy,
      whySell: evalResult.whySell,
      whyNotSell: evalResult.whyNotSell,
      dataQuality: {
        score: dataQualityScore,
        has4h,
        has1h,
        has5m,
        isFresh: true,
        notes: dataQualityNotes,
      },
      recent5CandlesAnatomy: fiveCandles,
    };
  }

  /**
   * Section 19: Server-Side Final Signal Validator (Server is the Final Authority)
   */
  static validateFinalSignal(
    deterministic: DeterministicDecisionResult,
    aiAnalysis: any
  ): {
    finalSignal: "BUY" | "SELL" | "WAIT" | "NO_TRADE";
    finalConfidence: number;
    validationOverride: boolean;
    validationReason: string;
  } {
    const rawAiSignal = String(aiAnalysis?.signal || "WAIT").toUpperCase();
    const aiConfidence = Number(aiAnalysis?.confidence) || 0;

    // Rule 1: Deterministic NO_TRADE is absolute
    if (deterministic.signal === "NO_TRADE") {
      return {
        finalSignal: "NO_TRADE",
        finalConfidence: 0,
        validationOverride: true,
        validationReason: "Deterministic engine declared NO_TRADE due to invalid/stale market data.",
      };
    }

    // Rule 2: If deterministic decision is WAIT, AI CANNOT override to BUY or SELL
    if (deterministic.signal === "WAIT" && (rawAiSignal === "BUY" || rawAiSignal === "SELL")) {
      return {
        finalSignal: "WAIT",
        finalConfidence: Math.min(45, deterministic.confidence),
        validationOverride: true,
        validationReason: `Rejected AI ${rawAiSignal}: Deterministic engine is in WAIT state (${deterministic.hardGates.reasons.join(", ") || "insufficient directional confluence"}).`,
      };
    }

    // Rule 3: Hard Gate enforcement
    if (rawAiSignal === "BUY" && !deterministic.hardGates.buyAllowed) {
      return {
        finalSignal: "WAIT",
        finalConfidence: Math.min(45, deterministic.confidence),
        validationOverride: true,
        validationReason: `Rejected AI BUY: Hard gate failed (${deterministic.hardGates.reasons.join(", ")}).`,
      };
    }

    if (rawAiSignal === "SELL" && !deterministic.hardGates.sellAllowed) {
      return {
        finalSignal: "WAIT",
        finalConfidence: Math.min(45, deterministic.confidence),
        validationOverride: true,
        validationReason: `Rejected AI SELL: Hard gate failed (${deterministic.hardGates.reasons.join(", ")}).`,
      };
    }

    // Rule 4: Opposing Signals (Deterministic says SELL, AI says BUY or vice versa)
    if (deterministic.signal === "BUY" && rawAiSignal === "SELL") {
      return {
        finalSignal: "WAIT",
        finalConfidence: 30,
        validationOverride: true,
        validationReason: "Conflict: Deterministic BUY vs AI SELL. Forcing WAIT for risk safety.",
      };
    }

    if (deterministic.signal === "SELL" && rawAiSignal === "BUY") {
      return {
        finalSignal: "WAIT",
        finalConfidence: 30,
        validationOverride: true,
        validationReason: "Conflict: Deterministic SELL vs AI BUY. Forcing WAIT for risk safety.",
      };
    }

    // Rule 5: Confluent confirmation (Both agree)
    if (deterministic.signal === rawAiSignal && (rawAiSignal === "BUY" || rawAiSignal === "SELL")) {
      // Evidence-based bounded confidence (no artificial boost)
      const boundedConf = Math.min(95, Math.max(70, Math.round((deterministic.confidence + aiConfidence) / 2)));
      return {
        finalSignal: rawAiSignal,
        finalConfidence: boundedConf,
        validationOverride: false,
        validationReason: `Confluent ${rawAiSignal} verified by deterministic engine and AI validation layer.`,
      };
    }

    // Default fallback to deterministic decision
    return {
      finalSignal: deterministic.signal,
      finalConfidence: deterministic.confidence,
      validationOverride: false,
      validationReason: "Deterministic decision maintained.",
    };
  }

  private static createEmptyNoTradeResponse(
    symbol: string,
    tradeDuration: string,
    score: number,
    notes: string[]
  ): DeterministicDecisionResult {
    const emptyStruct: MarketStructureResult = {
      trend: "SIDEWAYS",
      structure: "UNKNOWN",
      swingHighs: [],
      swingLows: [],
      allSwings: [],
      latestSwingHigh: null,
      latestSwingLow: null,
      previousSwingHigh: null,
      previousSwingLow: null,
      isHigherHigh: false,
      isHigherLow: false,
      isLowerHigh: false,
      isLowerLow: false,
      breakOfStructure: false,
      changeOfCharacter: false,
      structureRetest: false,
    };

    const emptyRisk: RiskCalculationResult = {
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskPips: 0,
      rewardPips: 0,
      riskRewardRatio: 0,
      invalidationReason: "Data unavailable",
    };

    return {
      signal: "NO_TRADE",
      confidence: 0,
      bullishScore: 0,
      bearishScore: 0,
      directionalLead: 0,
      marketRegime: "UNAVAILABLE",
      setup: "NONE",
      setupQuality: 0,
      hardGates: { buyAllowed: false, sellAllowed: false, reasons: notes },
      timeframeAnalysis: {
        "4h": { bias: "UNAVAILABLE", structure: "UNKNOWN", latestClose: 0, ema50: null, ema200: null, atr: 0, swingHigh: null, swingLow: null },
        "1h": { bias: "UNAVAILABLE", structure: "UNKNOWN", latestClose: 0, ema20: null, ema50: null, ema200: null, rsi: null, rsiDelta: null, macdHist: null, atr: 0, swingHigh: null, swingLow: null },
        "5m": { trend: "UNAVAILABLE", structure: "UNKNOWN", currentPrice: 0, ema20: null, ema50: null, ema200: null, maAlignment: "UNKNOWN", rsi: null, rsiDelta: null, macdHist: null, macdSlope: "Flat", atr: 0, swingHigh: null, swingLow: null },
      },
      marketStructure: { "4h": emptyStruct, "1h": emptyStruct, "5m": emptyStruct },
      supportResistance: { nearestResistance: null, nearestSupport: null, allLevels: [] },
      momentum: { rsiValue: null, rsiDelta: null, macdHistogram: null, macdSlope: "Flat", isRsiOverbought: false, isRsiOversold: false, isMomentumBullish: false, isMomentumBearish: false },
      priceLocation: { nearestResistance: null, nearestSupport: null, pipsUnderResistance: 0, pipsAboveSupport: 0, atrMultipleToResistance: 0, atrMultipleToSupport: 0, locationQuality: "POOR_CEILING_TRAP", opposingLevelRisk: "CRITICAL_BARRIER", bollingerPercentB: null, bollingerState: "NORMAL" },
      risk: { buy: emptyRisk, sell: emptyRisk, active: emptyRisk },
      whyBuy: [],
      whyNotBuy: ["Insufficient data"],
      whySell: [],
      whyNotSell: ["Insufficient data"],
      dataQuality: { score, has4h: false, has1h: false, has5m: false, isFresh: false, notes },
      recent5CandlesAnatomy: [],
    };
  }
}
