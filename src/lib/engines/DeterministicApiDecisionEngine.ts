import { TwelveDataIndicatorAdapter, NormalizedIndicatorSet, TwelveDataIndicatorsPayload } from "./TwelveDataIndicatorAdapter";

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
  bullishBOS?: boolean;
  bearishBOS?: boolean;
  bullishCHOCH?: boolean;
  bearishCHOCH?: boolean;
  falseBreakout?: boolean;
  breakoutConfirmed?: boolean;
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
  signalStrength: "NORMAL" | "STRONG";
  confidence: number;
  bullishScore: number;
  bearishScore: number;
  directionalLead: number;
  directionalBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  directionalStrength: number;
  tradeQuality: number;
  tradeable: boolean;
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
  factors?: {
    htfAlignment: { bullish: number; bearish: number; max: number };
    marketStructure: { bullish: number; bearish: number; max: number };
    momentum: { bullish: number; bearish: number; max: number };
    entryLocation: { bullish: number; bearish: number; max: number };
    supportResistance: { bullish: number; bearish: number; max: number };
    riskReward: { bullish: number; bearish: number; max: number };
    entryConfirmation: { bullish: number; bearish: number; max: number };
    total: { bullish: number; bearish: number; max: number };
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
   * Ensures data validity, deduplication by datetime, and strict chronological order (oldest to newest)
   */
  static parseCandles(rawValues: any[]): Candle[] {
    if (!Array.isArray(rawValues) || rawValues.length === 0) return [];
    
    // Parse valid raw entries
    const parsed: Candle[] = [];
    for (const c of rawValues) {
      if (!c || typeof c !== "object") continue;
      const open = typeof c.open === "number" ? c.open : parseFloat(c.open);
      const high = typeof c.high === "number" ? c.high : parseFloat(c.high);
      const low = typeof c.low === "number" ? c.low : parseFloat(c.low);
      const close = typeof c.close === "number" ? c.close : parseFloat(c.close);
      const volume = c.volume != null ? (typeof c.volume === "number" ? c.volume : parseFloat(c.volume)) : undefined;
      const datetime = String(c.datetime || c.time || c.timestamp || "");

      if (
        Number.isFinite(open) && open > 0 &&
        Number.isFinite(high) && high > 0 &&
        Number.isFinite(low) && low > 0 &&
        Number.isFinite(close) && close > 0
      ) {
        // Enforce structural OHLC sanity (high is at least max(open, close, high), low is at most min(open, close, low))
        const saneHigh = Math.max(high, open, close);
        const saneLow = Math.min(low, open, close);
        parsed.push({
          datetime,
          open,
          high: saneHigh,
          low: saneLow,
          close,
          volume: Number.isFinite(volume) ? volume : undefined,
        });
      }
    }

    if (parsed.length === 0) return [];

    // Deduplicate by datetime while preserving order
    const seen = new Map<string, Candle>();
    for (const candle of parsed) {
      seen.set(candle.datetime, candle);
    }
    const deduplicated = Array.from(seen.values());

    // Sort ascending chronologically (oldest first, newest last)
    deduplicated.sort((a, b) => {
      const timeA = new Date(a.datetime).getTime();
      const timeB = new Date(b.datetime).getTime();
      if (!isNaN(timeA) && !isNaN(timeB)) {
        return timeA - timeB;
      }
      return a.datetime.localeCompare(b.datetime);
    });

    return deduplicated;
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
    let bullishBOS = false;
    let bearishBOS = false;
    let bullishCHOCH = false;
    let bearishCHOCH = false;
    let falseBreakout = false;
    let breakoutConfirmed = false;
    let structureRetest = false;

    const latestCandle = candles[candles.length - 1];
    if (latestCandle) {
      if (latestSwingHigh) {
        const isCloseAboveHigh = latestCandle.close > latestSwingHigh.price;
        const isWickAboveHigh = latestCandle.high > latestSwingHigh.price && latestCandle.close <= latestSwingHigh.price;

        // False Breakout (Wick sweep / Liquidity grab without candle body close confirmation)
        if (isWickAboveHigh) {
          falseBreakout = true;
          breakoutConfirmed = false;
          bullishBOS = false;
          bullishCHOCH = false;
        }

        // Bullish BOS / CHOCH: Confirmed candle close above Swing High
        if (isCloseAboveHigh) {
          breakoutConfirmed = true;
          falseBreakout = false;
          if (structure === "BULLISH_STRUCTURE") {
            bullishBOS = true;
            breakOfStructure = true;
          } else {
            // Bullish CHOCH: Non-bullish structure broken upward by Confirmed Close > Swing High
            bullishCHOCH = true;
            changeOfCharacter = true;
          }
        }

        const distHigh = Math.abs(latestCandle.close - latestSwingHigh.price);
        const avgCandleRange = Math.max(0.0001, latestCandle.high - latestCandle.low);
        if (distHigh <= avgCandleRange * 0.4) {
          structureRetest = true;
        }
      }

      if (latestSwingLow) {
        const isCloseBelowLow = latestCandle.close < latestSwingLow.price;
        const isWickBelowLow = latestCandle.low < latestSwingLow.price && latestCandle.close >= latestSwingLow.price;

        // False Breakout (Wick sweep / Liquidity grab without candle body close confirmation)
        if (isWickBelowLow) {
          falseBreakout = true;
          breakoutConfirmed = false;
          bearishBOS = false;
          bearishCHOCH = false;
        }

        // Bearish BOS / CHOCH: Confirmed candle close below Swing Low
        if (isCloseBelowLow) {
          breakoutConfirmed = true;
          falseBreakout = false;
          if (structure === "BEARISH_STRUCTURE") {
            bearishBOS = true;
            breakOfStructure = true;
          } else {
            // Bearish CHOCH: Non-bearish structure broken downward by Confirmed Close < Swing Low
            bearishCHOCH = true;
            changeOfCharacter = true;
          }
        }

        const distLow = Math.abs(latestCandle.close - latestSwingLow.price);
        const avgCandleRange = Math.max(0.0001, latestCandle.high - latestCandle.low);
        if (distLow <= avgCandleRange * 0.4) {
          structureRetest = true;
        }
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
      bullishBOS,
      bearishBOS,
      bullishCHOCH,
      bearishCHOCH,
      falseBreakout,
      breakoutConfirmed,
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
   * Guarantees geometric invariants and realistic structural targets:
   * BUY:  SL < Entry < TP  (riskPips > 0, rewardPips > 0)
   * SELL: TP < Entry < SL  (riskPips > 0, rewardPips > 0)
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
    const minBuffer = Math.max(0.0003, safeAtr * 0.5);
    const maxSlDist = safeAtr * 2.5;

    if (direction === "BUY") {
      // Invalidation SL is below recent swing low or structural support, bounded between minBuffer and maxSlDist
      let slPrice = entryPrice - safeAtr * 1.2;
      let invalidationReason = "1.2x ATR Technical Invalidation";

      if (swings.latestSwingLow && swings.latestSwingLow.price < entryPrice) {
        const swingSl = swings.latestSwingLow.price - safeAtr * 0.2;
        const dist = entryPrice - swingSl;
        if (dist >= minBuffer && dist <= maxSlDist) {
          slPrice = swingSl;
          invalidationReason = `Recent 5M Swing Low (${swings.latestSwingLow.price}) buffer`;
        }
      } else if (sr.nearestSupport && sr.nearestSupport.price < entryPrice) {
        const supportSl = sr.nearestSupport.price - safeAtr * 0.2;
        const dist = entryPrice - supportSl;
        if (dist >= minBuffer && dist <= maxSlDist) {
          slPrice = supportSl;
          invalidationReason = `Structural Support (${sr.nearestSupport.price}) buffer`;
        }
      }

      // Hard clamp SL below entry by at least minBuffer and not exceeding maxSlDist
      slPrice = Math.min(slPrice, entryPrice - minBuffer);
      slPrice = Math.max(slPrice, entryPrice - maxSlDist);

      // Realistic structural target: front-run swing high or overhead resistance
      let tpPrice = entryPrice + safeAtr * 1.8;
      if (swings.latestSwingHigh && swings.latestSwingHigh.price > entryPrice) {
        const swingTp = swings.latestSwingHigh.price - safeAtr * 0.15;
        tpPrice = Math.min(tpPrice, Math.max(entryPrice + minBuffer, swingTp));
      }
      if (sr.nearestResistance && sr.nearestResistance.price > entryPrice) {
        const resTp = sr.nearestResistance.price - safeAtr * 0.15;
        tpPrice = Math.min(tpPrice, Math.max(entryPrice + minBuffer, resTp));
      }
      // Hard clamp TP above entry by at least minBuffer
      tpPrice = Math.max(tpPrice, entryPrice + minBuffer);

      const riskDist = Math.max(minBuffer, entryPrice - slPrice);
      const rewardDist = Math.max(minBuffer, tpPrice - entryPrice);
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
        const swingSl = swings.latestSwingHigh.price + safeAtr * 0.2;
        const dist = swingSl - entryPrice;
        if (dist >= minBuffer && dist <= maxSlDist) {
          slPrice = swingSl;
          invalidationReason = `Recent 5M Swing High (${swings.latestSwingHigh.price}) buffer`;
        }
      } else if (sr.nearestResistance && sr.nearestResistance.price > entryPrice) {
        const resSl = sr.nearestResistance.price + safeAtr * 0.2;
        const dist = resSl - entryPrice;
        if (dist >= minBuffer && dist <= maxSlDist) {
          slPrice = resSl;
          invalidationReason = `Structural Resistance (${sr.nearestResistance.price}) buffer`;
        }
      }

      // Hard clamp SL above entry by at least minBuffer and not exceeding maxSlDist
      slPrice = Math.max(slPrice, entryPrice + minBuffer);
      slPrice = Math.min(slPrice, entryPrice + maxSlDist);

      // Realistic structural target: front-run swing low or underlying support
      let tpPrice = entryPrice - safeAtr * 1.8;
      if (swings.latestSwingLow && swings.latestSwingLow.price < entryPrice) {
        const swingTp = swings.latestSwingLow.price + safeAtr * 0.15;
        tpPrice = Math.max(tpPrice, Math.min(entryPrice - minBuffer, swingTp));
      }
      if (sr.nearestSupport && sr.nearestSupport.price < entryPrice) {
        const suppTp = sr.nearestSupport.price + safeAtr * 0.15;
        tpPrice = Math.max(tpPrice, Math.min(entryPrice - minBuffer, suppTp));
      }
      // Hard clamp TP below entry by at least minBuffer
      tpPrice = Math.min(tpPrice, entryPrice - minBuffer);

      const riskDist = Math.max(minBuffer, slPrice - entryPrice);
      const rewardDist = Math.max(minBuffer, entryPrice - tpPrice);
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
   * Strict 7-Factor 100-Point Model:
   * A. HTF Alignment (20)
   * B. Market Structure (20)
   * C. Momentum (15)
   * D. Entry Location (15)
   * E. Support / Resistance (10)
   * F. Risk / Reward (10)
   * G. Entry Confirmation (10)
   * Total = 100 Points
   */
  static evaluateEvidenceAndGates(
    currentPrice: number,
    trend4h: string,
    trend1h: string,
    structure5m: MarketStructureResult,
    setupObj: { setup: DeterministicDecisionResult["setup"]; quality: number; rationale: string },
    sr: { nearestResistance: SupportResistanceLevel | null; nearestSupport: SupportResistanceLevel | null; allLevels?: SupportResistanceLevel[] },
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
    pipMultiplier: number,
    riskContext?: {
      buyRisk?: RiskCalculationResult;
      sellRisk?: RiskCalculationResult;
    }
  ) {
    let bullishScore = 0;
    let bearishScore = 0;
    const whyBuy: string[] = [];
    const whyNotBuy: string[] = [];
    const whySell: string[] = [];
    const whyNotSell: string[] = [];
    const hardGateReasons: string[] = [];

    const safeAtr = Math.max(0.0001, indicators5m.atr);

    // =========================================================================
    // 1. Higher-Timeframe Alignment (Max 20 pts: 4H 10 pts + 1H 10 pts)
    // =========================================================================
    let htfBullish = 0;
    let htfBearish = 0;

    if (trend4h.includes("Bullish")) {
      htfBullish += 10;
      whyBuy.push("4H Macro trend is Bullish (+10)");
    } else if (trend4h.includes("Bearish")) {
      htfBearish += 10;
      whySell.push("4H Macro trend is Bearish (+10)");
    }

    if (trend1h.includes("Bullish")) {
      htfBullish += 10;
      whyBuy.push("1H Intermediate trend confirms Bullish structure (+10)");
    } else if (trend1h.includes("Bearish")) {
      htfBearish += 10;
      whySell.push("1H Intermediate trend confirms Bearish structure (+10)");
    }

    bullishScore += htfBullish;
    bearishScore += htfBearish;

    // =========================================================================
    // 2. 5M Market Structure (Max 20 pts)
    // Missing / neutral structure contributes 0 points.
    // =========================================================================
    let structBullish = 0;
    let structBearish = 0;

    if (structure5m.structure === "BULLISH_STRUCTURE" || structure5m.bullishBOS || structure5m.bullishCHOCH) {
      structBullish = 20;
      whyBuy.push("5M prints Higher Highs and Higher Lows / Bullish BOS (+20)");
      whyNotSell.push("5M structure is structurally Bullish");
    } else if (structure5m.structure === "BEARISH_STRUCTURE" || structure5m.bearishBOS || structure5m.bearishCHOCH) {
      structBearish = 20;
      whySell.push("5M prints Lower Highs and Lower Lows / Bearish BOS (+20)");
      whyNotBuy.push("5M structure is structurally Bearish");
    } else {
      // Neutral / unknown / transition contributes exactly 0 points
      structBullish = 0;
      structBearish = 0;
    }

    bullishScore += structBullish;
    bearishScore += structBearish;

    // =========================================================================
    // 3. Momentum: RSI (8 pts) + MACD (7 pts) (Max 15 pts)
    // =========================================================================
    let momBullish = 0;
    let momBearish = 0;

    const rsi = indicators5m.rsi;
    const rsiDelta = indicators5m.rsiDelta;
    const macdSlope = indicators5m.macdSlope;

    if (rsi != null) {
      if (rsi > 55 && (rsiDelta == null || rsiDelta >= 0)) {
        momBullish += 8;
        whyBuy.push(`RSI (${rsi.toFixed(1)}) in bullish expansion (+8)`);
      } else if (rsi < 45 && (rsiDelta == null || rsiDelta <= 0)) {
        momBearish += 8;
        whySell.push(`RSI (${rsi.toFixed(1)}) in bearish expansion (+8)`);
      }
    }

    const macdHist = indicators5m.macdHist;
    if (macdHist != null) {
      if (macdHist > 0 && (macdSlope === "Rising" || macdSlope === "Bullish Cross")) {
        momBullish += 7;
        whyBuy.push(`MACD histogram (${macdHist.toFixed(5)}) is positive and expanding (+7)`);
      } else if (macdHist < 0 && (macdSlope === "Falling" || macdSlope === "Bearish Cross")) {
        momBearish += 7;
        whySell.push(`MACD histogram (${macdHist.toFixed(5)}) is negative and expanding (+7)`);
      } else if (macdHist > 0) {
        momBullish += 3;
        whyBuy.push(`MACD histogram (${macdHist.toFixed(5)}) is positive (+3)`);
      } else if (macdHist < 0) {
        momBearish += 3;
        whySell.push(`MACD histogram (${macdHist.toFixed(5)}) is negative (+3)`);
      }
    } else {
      if (macdSlope === "Rising" || macdSlope === "Bullish Cross") {
        momBullish += 5;
        whyBuy.push(`MACD histogram is rising/bullish cross (+5)`);
      } else if (macdSlope === "Falling" || macdSlope === "Bearish Cross") {
        momBearish += 5;
        whySell.push(`MACD histogram is falling/bearish cross (+5)`);
      }
    }

    bullishScore += Math.min(15, momBullish);
    bearishScore += Math.min(15, momBearish);

    // =========================================================================
    // 4. Entry Location (Max 15 pts)
    // Evaluates:
    // (a) Moving Average Alignment / Pullback Position (Max 7 pts)
    // (b) Opposing Barrier Clearance (Max 5 pts)
    // (c) Value Zone & Not Overextended (Max 3 pts)
    // =========================================================================
    let locBullish = 0;
    let locBearish = 0;

    const e20 = indicators5m.ema20;
    const e50 = indicators5m.ema50;

    // (a) MA Position
    let emaLocBull = 0;
    let emaLocBear = 0;
    if (e20 && e50) {
      if (currentPrice > e20 && e20 > e50) {
        emaLocBull = 7;
        whyBuy.push("Price positioned above Bullish EMA stack (+7)");
      } else if (currentPrice < e20 && e20 < e50) {
        emaLocBear = 7;
        whySell.push("Price positioned below Bearish EMA stack (+7)");
      } else if (e20 > currentPrice && currentPrice > e50) {
        emaLocBull = 5;
        whyBuy.push("Bullish pullback zone into dynamic support (+5)");
      } else if (e20 < currentPrice && currentPrice < e50) {
        emaLocBear = 5;
        whySell.push("Bearish pullback zone into dynamic resistance (+5)");
      }
    }

    // (b) S/R Barrier Clearance
    const pipsUnderR1 = sr.nearestResistance ? (sr.nearestResistance.price - currentPrice) * pipMultiplier : 999;
    const distAtrR1 = sr.nearestResistance ? (sr.nearestResistance.price - currentPrice) / safeAtr : 99;
    const pipsAboveS1 = sr.nearestSupport ? (currentPrice - sr.nearestSupport.price) * pipMultiplier : 999;
    const distAtrS1 = sr.nearestSupport ? (currentPrice - sr.nearestSupport.price) / safeAtr : 99;

    let barrierLocBull = 0;
    let barrierLocBear = 0;

    if (pipsUnderR1 >= 5.0 || distAtrR1 >= 1.5) {
      barrierLocBull = 5;
      whyBuy.push(`Substantial runway to resistance (${pipsUnderR1.toFixed(1)}p) (+5)`);
    } else if (pipsUnderR1 >= 3.0) {
      barrierLocBull = 3;
      whyBuy.push(`Adequate clearance to resistance (${pipsUnderR1.toFixed(1)}p) (+3)`);
    } else {
      barrierLocBull = 0; // Trapped or near ceiling
    }

    if (pipsAboveS1 >= 5.0 || distAtrS1 >= 1.5) {
      barrierLocBear = 5;
      whySell.push(`Substantial runway to support (${pipsAboveS1.toFixed(1)}p) (+5)`);
    } else if (pipsAboveS1 >= 3.0) {
      barrierLocBear = 3;
      whySell.push(`Adequate clearance to support (${pipsAboveS1.toFixed(1)}p) (+3)`);
    } else {
      barrierLocBear = 0; // Trapped or near floor
    }

    // (c) Value Zone & Overextension check
    let valueLocBull = 0;
    let valueLocBear = 0;
    if (rsi == null || rsi <= 68) {
      valueLocBull = 3;
    }
    if (rsi == null || rsi >= 32) {
      valueLocBear = 3;
    }

    locBullish = Math.min(15, emaLocBull + barrierLocBull + valueLocBull);
    locBearish = Math.min(15, emaLocBear + barrierLocBear + valueLocBear);

    bullishScore += locBullish;
    bearishScore += locBearish;

    // =========================================================================
    // 5. Support / Resistance (Max 10 pts: Directional Opportunity)
    // Evaluates bounce/rejection, discount/premium zone, and barrier risk.
    // =========================================================================
    let srBullish = 0;
    let srBearish = 0;

    // BUY S/R Evaluation
    if (pipsUnderR1 < 2.5 || distAtrR1 < 0.75) {
      srBullish = 0; // Directly at ceiling
    } else if (pipsAboveS1 <= 2.5 || setupObj.setup === "SUPPORT_REJECTION") {
      srBullish = 10; // Floor bounce confirmed
      whyBuy.push("Support floor bounce confirmed with clear headroom (+10)");
    } else if (pipsAboveS1 < pipsUnderR1 && pipsUnderR1 >= 3.0) {
      srBullish = 8; // Discount zone with room
      whyBuy.push(`Price in favorable discount zone near support (${pipsAboveS1.toFixed(1)}p) with clear room (+8)`);
    } else if (pipsUnderR1 >= 4.0 && pipsAboveS1 >= 4.0) {
      srBullish = 5; // Balanced mid-range with clear room both ways
      whyBuy.push("Adequate clearance to overhead resistance (+5)");
    } else if (pipsUnderR1 >= 3.0) {
      srBullish = 2; // In upper half of range
    } else {
      srBullish = 0;
    }

    // SELL S/R Evaluation
    if (pipsAboveS1 < 2.5 || distAtrS1 < 0.75) {
      srBearish = 0; // Directly at floor
    } else if (pipsUnderR1 <= 2.5 || setupObj.setup === "RESISTANCE_REJECTION") {
      srBearish = 10; // Ceiling rejection confirmed
      whySell.push("Resistance ceiling rejection confirmed with clear room below (+10)");
    } else if (pipsUnderR1 < pipsAboveS1 && pipsAboveS1 >= 3.0) {
      srBearish = 8; // Premium zone with room
      whySell.push(`Price in favorable premium zone near resistance (${pipsUnderR1.toFixed(1)}p) with clear room (+8)`);
    } else if (pipsAboveS1 >= 4.0 && pipsUnderR1 >= 4.0) {
      srBearish = 5; // Balanced mid-range with clear room both ways
      whySell.push("Adequate clearance to underlying support (+5)");
    } else if (pipsAboveS1 >= 3.0) {
      srBearish = 2; // In lower half of range
    } else {
      srBearish = 0;
    }

    bullishScore += srBullish;
    bearishScore += srBearish;

    // =========================================================================
    // 6. Risk / Reward Structure (Max 10 pts)
    // =========================================================================
    let rrBullish = 0;
    let rrBearish = 0;

    const buyRr = riskContext?.buyRisk?.riskRewardRatio;
    const sellRr = riskContext?.sellRisk?.riskRewardRatio;

    if (buyRr != null) {
      if (buyRr >= 1.5) {
        rrBullish = 10;
        whyBuy.push(`Optimal calculated Risk/Reward (${buyRr.toFixed(2)} >= 1.5) (+10)`);
      } else if (buyRr >= 1.1) {
        rrBullish = 5;
        whyBuy.push(`Acceptable calculated Risk/Reward (${buyRr.toFixed(2)} >= 1.1) (+5)`);
      }
    }

    if (sellRr != null) {
      if (sellRr >= 1.5) {
        rrBearish = 10;
        whySell.push(`Optimal calculated Risk/Reward (${sellRr.toFixed(2)} >= 1.5) (+10)`);
      } else if (sellRr >= 1.1) {
        rrBearish = 5;
        whySell.push(`Acceptable calculated Risk/Reward (${sellRr.toFixed(2)} >= 1.1) (+5)`);
      }
    }

    bullishScore += rrBullish;
    bearishScore += rrBearish;

    // =========================================================================
    // 7. Price Action / Trigger Candle Anatomy Confirmation (Max 10 pts)
    // =========================================================================
    let confBullish = 0;
    let confBearish = 0;

    const lastC = latestCandles[latestCandles.length - 1];
    if (lastC) {
      const isBullishCandle = lastC.close >= lastC.open;
      const range = Math.max(0.00001, lastC.high - lastC.low);
      const bodyRatio = Math.abs(lastC.close - lastC.open) / range;
      const lowerWickRatio = (Math.min(lastC.open, lastC.close) - lastC.low) / range;
      const upperWickRatio = (lastC.high - Math.max(lastC.open, lastC.close)) / range;

      if (isBullishCandle && (bodyRatio >= 0.6 || lowerWickRatio >= 0.4)) {
        confBullish = 10;
        whyBuy.push("Recent trigger candle shows strong buyer pressure (+10)");
      } else if (!isBullishCandle && (bodyRatio >= 0.6 || upperWickRatio >= 0.4)) {
        confBearish = 10;
        whySell.push("Recent trigger candle shows strong seller pressure (+10)");
      }
    }

    bullishScore += confBullish;
    bearishScore += confBearish;

    // =========================================================================
    // Hard Gate Validations
    // =========================================================================
    let buyAllowed = true;
    let sellAllowed = true;

    // Check Distance to Resistance (Ceiling Trap)
    let isCeilingTrapped = false;
    if (sr.nearestResistance) {
      const distPips = (sr.nearestResistance.price - currentPrice) * pipMultiplier;
      const distAtr = (sr.nearestResistance.price - currentPrice) / safeAtr;
      if (distPips < 2.5 || distAtr < 0.75) {
        isCeilingTrapped = true;
        if (setupObj.setup !== "BREAKOUT_CONFIRMED") {
          buyAllowed = false;
          whyNotBuy.push(`Hard Gate: Price trapped just ${distPips.toFixed(1)}p below Resistance ceiling`);
          hardGateReasons.push(`Resistance Ceiling Trap (${distPips.toFixed(1)}p to barrier)`);
        }
      }
    }

    // Check Distance to Support (Floor Trap)
    let isFloorTrapped = false;
    if (sr.nearestSupport) {
      const distPips = (currentPrice - sr.nearestSupport.price) * pipMultiplier;
      const distAtr = (currentPrice - sr.nearestSupport.price) / safeAtr;
      if (distPips < 2.5 || distAtr < 0.75) {
        isFloorTrapped = true;
        if (setupObj.setup !== "BREAKOUT_CONFIRMED") {
          sellAllowed = false;
          whyNotSell.push(`Hard Gate: Price trapped just ${distPips.toFixed(1)}p above Support floor`);
          hardGateReasons.push(`Support Floor Trap (${distPips.toFixed(1)}p to barrier)`);
        }
      }
    }

    // Hard Gate: Tight S/R Corridor Squeeze (Trapped between both ceiling and floor)
    if (isCeilingTrapped && isFloorTrapped) {
      buyAllowed = false;
      sellAllowed = false;
      hardGateReasons.push("Tight Support/Resistance Corridor Squeeze");
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
      factors: {
        htfAlignment: { bullish: htfBullish, bearish: htfBearish, max: 20 },
        marketStructure: { bullish: structBullish, bearish: structBearish, max: 20 },
        momentum: { bullish: momBullish, bearish: momBearish, max: 15 },
        entryLocation: { bullish: locBullish, bearish: locBearish, max: 15 },
        supportResistance: { bullish: srBullish, bearish: srBearish, max: 10 },
        riskReward: { bullish: rrBullish, bearish: rrBearish, max: 10 },
        entryConfirmation: { bullish: confBullish, bearish: confBearish, max: 10 },
        total: { bullish: bullishScore, bearish: bearishScore, max: 100 },
      },
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
    tradeDuration = "5m",
    twelveDataIndicators?: TwelveDataIndicatorsPayload | NormalizedIndicatorSet | null
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

    // 1. Indicators (Normalized from TwelveData API or lookahead-free offline calculation fallback)
    const normalizedInds: NormalizedIndicatorSet =
      twelveDataIndicators && "source" in twelveDataIndicators && twelveDataIndicators["5m"]
        ? (twelveDataIndicators as NormalizedIndicatorSet)
        : TwelveDataIndicatorAdapter.normalizeIndicators(twelveDataIndicators as TwelveDataIndicatorsPayload, {
            "5m": candles5m,
            "1h": candles1h,
            "4h": candles4h,
          });

    const ind5m = normalizedInds["5m"];
    const ind1h = normalizedInds["1h"];
    const ind4h = normalizedInds["4h"];

    // 2. Swings & Market Structure (Using completed candles to prevent in-candle repainting)
    const completedCandles5m = candles5m.length > 20 ? candles5m.slice(0, -1) : candles5m;
    const struct4h = this.analyzeMarketStructure(candles4h, 3, 3);
    const struct1h = this.analyzeMarketStructure(candles1h, 3, 3);
    const struct5m = this.analyzeMarketStructure(completedCandles5m, 2, 2);

    const currentCandle = candles5m[candles5m.length - 1];
    const currentPrice = currentCandle.close;

    // Indicator extracts
    const ema20_5m = ind5m.ema20;
    const ema50_5m = ind5m.ema50;
    const ema200_5m = ind5m.ema200;
    const rsi_5m = ind5m.rsi;
    const rsiDelta_5m = ind5m.rsiDelta;
    const macdHist_5m = ind5m.macd.histogram;
    const macdSlope_5m = ind5m.macdSlope;
    const atr_5m = ind5m.atr;

    // 4H Bias
    const c4h = candles4h.length ? candles4h[candles4h.length - 1].close : currentPrice;
    const e50_4h = ind4h.ema50;
    const e200_4h = ind4h.ema200;
    let bias4h = "Neutral / Indecisive";
    if (e50_4h) {
      if (e200_4h && c4h > e50_4h && e50_4h > e200_4h) bias4h = "Strong Macro Bullish (Price > EMA50 > EMA200)";
      else if (e200_4h && c4h < e50_4h && e50_4h < e200_4h) bias4h = "Strong Macro Bearish (Price < EMA50 < EMA200)";
      else if (c4h > e50_4h) bias4h = "Macro Bullish (Price > EMA50)";
      else if (c4h < e50_4h) bias4h = "Macro Bearish (Price < EMA50)";
    }

    // 1H Bias
    const c1h = candles1h.length ? candles1h[candles1h.length - 1].close : currentPrice;
    const e20_1h = ind1h.ema20;
    const e50_1h = ind1h.ema50;
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

    // 4. Setup Classification (Evaluated on completed candles)
    const setupObj = this.classifySetup(
      bias4h,
      bias1h,
      struct5m,
      completedCandles5m.slice(-10),
      ema20_5m,
      ema50_5m,
      rsi_5m,
      rsiDelta_5m,
      macdHist_5m,
      macdSlope_5m,
      atr_5m,
      sr
    );

    // 5. Risk Engine
    const buyRisk = this.calculateRisk(currentPrice, "BUY", atr_5m, sr, struct5m, pipMultiplier);
    const sellRisk = this.calculateRisk(currentPrice, "SELL", atr_5m, sr, struct5m, pipMultiplier);

    // 6. Evidence & Hard Gates (Strict 7-Factor 100-Point Model with completed candle trigger confirmation)
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
      completedCandles5m.slice(-5),
      pipMultiplier,
      { buyRisk, sellRisk }
    );

    // 7. Calculate Trade Quality Independently from Direction
    let buyTradeQuality = 30;
    let sellTradeQuality = 30;

    const pipsUnderR1Calc = sr.nearestResistance ? (sr.nearestResistance.price - currentPrice) * pipMultiplier : 999;
    const pipsAboveS1Calc = sr.nearestSupport ? (currentPrice - sr.nearestSupport.price) * pipMultiplier : 999;

    // BUY Trade Quality Assessment
    if (evalResult.hardGates.buyAllowed && buyRisk.riskRewardRatio >= 1.1) {
      let q = 40;
      if (pipsUnderR1Calc >= 5.0) q += 20;
      else if (pipsUnderR1Calc >= 3.0) q += 10;
      if (buyRisk.riskRewardRatio >= 1.5) q += 15;
      else if (buyRisk.riskRewardRatio >= 1.2) q += 10;
      if (setupObj.quality >= 70) q += 15;
      else if (setupObj.quality >= 50) q += 10;
      if (struct5m.breakOfStructure) q += 10;
      buyTradeQuality = Math.min(100, q);
    } else {
      buyTradeQuality = evalResult.hardGates.reasons.some((r) => r.includes("Resistance") || r.includes("Chop")) ? 20 : 35;
    }

    // SELL Trade Quality Assessment
    if (evalResult.hardGates.sellAllowed && sellRisk.riskRewardRatio >= 1.1) {
      let q = 40;
      if (pipsAboveS1Calc >= 5.0) q += 20;
      else if (pipsAboveS1Calc >= 3.0) q += 10;
      if (sellRisk.riskRewardRatio >= 1.5) q += 15;
      else if (sellRisk.riskRewardRatio >= 1.2) q += 10;
      if (setupObj.quality >= 70) q += 15;
      else if (setupObj.quality >= 50) q += 10;
      if (struct5m.breakOfStructure) q += 10;
      sellTradeQuality = Math.min(100, q);
    } else {
      sellTradeQuality = evalResult.hardGates.reasons.some((r) => r.includes("Support") || r.includes("Chop")) ? 20 : 35;
    }

    // 8. Deterministic Decision & Evidence-Based Confidence
    let signal: DeterministicDecisionResult["signal"] = "WAIT";
    let activeRisk = buyRisk;
    let confidence = 35;
    let tradeQuality = 30;

    const isBuyConfluent =
      evalResult.hardGates.buyAllowed &&
      evalResult.bullishScore >= 75 &&
      evalResult.bullishScore >= evalResult.bearishScore + 10 &&
      buyTradeQuality >= 70 &&
      buyRisk.riskRewardRatio >= 1.1;

    const isSellConfluent =
      evalResult.hardGates.sellAllowed &&
      evalResult.bearishScore >= 75 &&
      evalResult.bearishScore >= evalResult.bullishScore + 10 &&
      sellTradeQuality >= 70 &&
      sellRisk.riskRewardRatio >= 1.1;

    if (isBuyConfluent) {
      signal = "BUY";
      activeRisk = buyRisk;
      tradeQuality = buyTradeQuality;
      // High quality setup + confirmed entry + good location + valid RR -> 75% to 92%
      confidence = Math.min(
        92,
        Math.round(75 + (evalResult.bullishScore - 75) * 0.4 + (buyTradeQuality - 70) * 0.4 + Math.min(2.0, buyRisk.riskRewardRatio - 1.1) * 5)
      );
    } else if (isSellConfluent) {
      signal = "SELL";
      activeRisk = sellRisk;
      tradeQuality = sellTradeQuality;
      // High quality setup + confirmed entry + good location + valid RR -> 75% to 92%
      confidence = Math.min(
        92,
        Math.round(75 + (evalResult.bearishScore - 75) * 0.4 + (sellTradeQuality - 70) * 0.4 + Math.min(2.0, sellRisk.riskRewardRatio - 1.1) * 5)
      );
    } else {
      signal = "WAIT";
      activeRisk = evalResult.bullishScore >= evalResult.bearishScore ? buyRisk : sellRisk;
      tradeQuality = Math.max(buyTradeQuality, sellTradeQuality);

      // Confidence Ceilings for WAIT / Non-tradeable setups
      let waitConfidence = 35;
      if (!has4h || !has1h) {
        waitConfidence = Math.min(40, Math.round(dataQualityScore * 0.4));
      } else if (evalResult.hardGates.reasons.some((r) => r.includes("Chop"))) {
        waitConfidence = 30;
      } else if (evalResult.hardGates.reasons.some((r) => r.includes("Trap"))) {
        waitConfidence = 45;
      } else if (bias4h.includes("Bearish") && bias1h.includes("Bullish")) {
        waitConfidence = 50; // Conflicting timeframes
      } else {
        waitConfidence = Math.min(55, Math.max(25, Math.round(evalResult.directionalLead * 0.5)));
      }
      confidence = waitConfidence;
    }

    // Directional Bias & Trade Quality Metrics
    let directionalBias: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (evalResult.bullishScore >= evalResult.bearishScore + 10) {
      directionalBias = "BULLISH";
    } else if (evalResult.bearishScore >= evalResult.bullishScore + 10) {
      directionalBias = "BEARISH";
    }
    const directionalStrength = Math.max(evalResult.bullishScore, evalResult.bearishScore);
    const tradeable = signal === "BUY" || signal === "SELL";

    let signalStrength: "NORMAL" | "STRONG" = "NORMAL";
    if (signal === "BUY" && evalResult.bullishScore >= 85 && evalResult.directionalLead >= 20 && buyTradeQuality >= 80 && buyRisk.riskRewardRatio >= 1.5) {
      signalStrength = "STRONG";
    } else if (signal === "SELL" && evalResult.bearishScore >= 85 && evalResult.directionalLead >= 20 && sellTradeQuality >= 80 && sellRisk.riskRewardRatio >= 1.5) {
      signalStrength = "STRONG";
    }

    // Price location
    const latestBb = ind5m.bb;
    let bbPercentB: number | null = null;
    let bbState: PriceLocationResult["bollingerState"] = "NORMAL";
    if (latestBb && latestBb.upper != null && latestBb.lower != null && latestBb.middle != null && latestBb.upper > latestBb.lower) {
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
      signalStrength,
      confidence,
      bullishScore: evalResult.bullishScore,
      bearishScore: evalResult.bearishScore,
      directionalLead: evalResult.directionalLead,
      directionalBias,
      directionalStrength,
      tradeQuality,
      tradeable,
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
          atr: ind4h.atr,
          swingHigh: struct4h.latestSwingHigh ? struct4h.latestSwingHigh.price : null,
          swingLow: struct4h.latestSwingLow ? struct4h.latestSwingLow.price : null,
        },
        "1h": {
          bias: bias1h,
          structure: struct1h.structure,
          latestClose: c1h,
          ema20: e20_1h,
          ema50: e50_1h,
          ema200: ind1h.ema200,
          rsi: ind1h.rsi,
          rsiDelta: ind1h.rsiDelta,
          macdHist: ind1h.macd.histogram,
          atr: ind1h.atr,
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
      factors: evalResult.factors,
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

    // Rule 3: Opposing Signals (Deterministic says BUY and AI says SELL or vice versa)
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

    // Rule 4: Hard Gate enforcement
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
      bullishBOS: false,
      bearishBOS: false,
      bullishCHOCH: false,
      bearishCHOCH: false,
      falseBreakout: false,
      breakoutConfirmed: false,
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
      signalStrength: "NORMAL",
      confidence: 0,
      bullishScore: 0,
      bearishScore: 0,
      directionalLead: 0,
      directionalBias: "NEUTRAL",
      directionalStrength: 0,
      tradeQuality: 0,
      tradeable: false,
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
      factors: {
        htfAlignment: { bullish: 0, bearish: 0, max: 20 },
        marketStructure: { bullish: 0, bearish: 0, max: 20 },
        momentum: { bullish: 0, bearish: 0, max: 15 },
        entryLocation: { bullish: 0, bearish: 0, max: 15 },
        supportResistance: { bullish: 0, bearish: 0, max: 10 },
        riskReward: { bullish: 0, bearish: 0, max: 10 },
        entryConfirmation: { bullish: 0, bearish: 0, max: 10 },
        total: { bullish: 0, bearish: 0, max: 100 },
      },
      whyBuy: [],
      whyNotBuy: ["Insufficient data"],
      whySell: [],
      whyNotSell: ["Insufficient data"],
      dataQuality: { score, has4h: false, has1h: false, has5m: false, isFresh: false, notes },
      recent5CandlesAnatomy: [],
    };
  }
}
