type Direction = "bullish" | "bearish";

type ScoreItem = {
  key: string;
  label: string;
  direction: Direction | null;
  weight: number;
  confidence: number;
  evidence: string;
};

export type MobileSignalRulesResult = {
  signal: "STRONG_BUY" | "BUY" | "WAIT" | "SELL" | "STRONG_SELL";
  trend: "Bullish" | "Bearish" | "Sideways";
  bullishScore: number;
  bearishScore: number;
  confidence: number;
  tradeQuality: number;
  availableWeight: number;
  evidenceCount: number;
  bullishEvidence: string[];
  bearishEvidence: string[];
  conflicts: string[];
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
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function confidence(value: unknown): number {
  const n = number(value);
  if (n === null || n <= 0) return 0;
  return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
}

function direction(value: unknown): Direction | null {
  const v = text(value);
  if (!v || v === "unknown" || v === "neutral" || v === "sideways" || v === "mixed" || v === "indecisive") return null;
  if (/bullish|bull|upward|rising|rise|positive|higher|buy|long/.test(v)) return "bullish";
  if (/bearish|bear|downward|falling|fall|negative|lower|sell|short/.test(v)) return "bearish";
  return null;
}

function indicatorDirection(indicator: any, kind: "rsi" | "macd" | "bb"): Direction | null {
  if (!indicator || typeof indicator !== "object" || indicator.visible === false) return null;

  const direct = direction(indicator.direction) || direction(indicator.state);
  if (direct) return direct;

  if (kind === "rsi") {
    const cross = text(indicator.cross50);
    if (/up|bull/.test(cross)) return "bullish";
    if (/down|bear/.test(cross)) return "bearish";
    const zone = text(indicator.zone);
    if (/above|over/.test(zone)) return "bullish";
    if (/below|under/.test(zone)) return "bearish";
  }

  if (kind === "macd") {
    const cross = text(indicator.cross) || text(indicator.lineRelationship);
    if (/bull|up/.test(cross)) return "bullish";
    if (/bear|down/.test(cross)) return "bearish";
    const histogram = text(indicator.histogramDirection);
    if (/increas|positive|up/.test(histogram)) return "bullish";
    if (/decreas|negative|down/.test(histogram)) return "bearish";
  }

  if (kind === "bb") {
    const cross = text(indicator.crossDirection) || text(indicator.middleCross);
    if (/up|bull/.test(cross)) return "bullish";
    if (/down|bear/.test(cross)) return "bearish";
  }

  return null;
}

function emaDirection(ema: any): Direction | null {
  if (!ema || typeof ema !== "object") return null;
  
  const entries = Object.entries(ema)
    .map(([key, value]: [string, any]) => {
      const periodMatch = key.match(/\d+/);
      const period = periodMatch ? parseInt(periodMatch[0], 10) : 0;
      return { period, data: value };
    })
    .filter(x => x.data && typeof x.data === "object" && number(x.data.value) !== null)
    .sort((a, b) => a.period - b.period);

  if (entries.length < 2) {
    return direction(Object.values(ema).map((x: any) => x?.state).join(" "));
  }

  const fastValue = number(entries[0].data.value);
  const slowValue = number(entries[entries.length - 1].data.value);

  if (fastValue !== null && slowValue !== null) {
    if (fastValue > slowValue) return "bullish";
    if (fastValue < slowValue) return "bearish";
  }
  return null;
}

function rsiDirection(rsi: any): Direction | null {
  if (!rsi || rsi.visible === false) return null;
  const direct = indicatorDirection(rsi, "rsi");
  if (direct) return direct;

  const value = number(rsi.value ?? rsi.approximateValue ?? rsi.rsi1 ?? rsi.rsi2 ?? rsi.rsi3);
  if (value !== null) {
    if (value > 50 && value < 70) return "bullish";
    if (value < 50 && value > 30) return "bearish";
  }
  return null;
}

function macdDirection(macd: any): Direction | null {
  if (!macd || macd.visible === false) return null;
  const direct = indicatorDirection(macd, "macd");
  const macdValue = number(macd.macd);
  const signalValue = number(macd.signal);
  if (macdValue !== null && signalValue !== null) {
    if (macdValue > signalValue) return "bullish";
    if (macdValue < signalValue) return "bearish";
  }
  return direct;
}

function bbDirection(bb: any, price: number | null): Direction | null {
  if (!bb || bb.visible === false) return null;
  const direct = indicatorDirection(bb, "bb");
  if (direct) return direct;
  const middle = number(bb.middle);
  if (price !== null && middle !== null) {
    if (price > middle) return "bullish";
    if (price < middle) return "bearish";
  }
  const position = text(bb.position);
  if (/above|upper/.test(position)) return "bullish";
  if (/below|lower/.test(position)) return "bearish";
  return null;
}

function candleDirection(candles: any): Direction | null {
  if (!candles || typeof candles !== "object") return null;
  const pattern = text(candles.latest?.pattern);
  if (/bullish_engulfing|hammer|inverted_hammer|morning_star|three_white/.test(pattern)) return "bullish";
  if (/bearish_engulfing|shooting_star|hanging_man|evening_star|three_black/.test(pattern)) return "bearish";
  return direction(candles.recentDirection) || direction(candles.priceAction);
}

function trendDirection(extraction: any): Direction | null {
  return direction(extraction?.trend?.state) || direction(extraction?.marketStructure?.state);
}

function levelDirection(extraction: any, price: number | null): Direction | null {
  if (price === null) return null;
  const supports = Array.isArray(extraction?.supportLevels) ? extraction.supportLevels : [];
  const resistances = Array.isArray(extraction?.resistanceLevels) ? extraction.resistanceLevels : [];
  
  const proximityWindow = 0.0003; 

  const supportNearby = supports.some((x: any) => {
    const n = number(x?.value ?? x?.price ?? x);
    return n !== null && Math.abs(price - n) / Math.max(Math.abs(price), 1) < proximityWindow;
  });
  const resistanceNearby = resistances.some((x: any) => {
    const n = number(x?.value ?? x?.price ?? x);
    return n !== null && Math.abs(price - n) / Math.max(Math.abs(price), 1) < proximityWindow;
  });
  
  if (supportNearby && !resistanceNearby) return "bullish";
  if (resistanceNearby && !supportNearby) return "bearish";
  return null;
}

export function calculateMobileSignalRules(extraction: any): MobileSignalRulesResult {
  const indicators = extraction?.indicators || {};
  const price = number(extraction?.currentPrice?.value);
  const bullishEvidence: string[] = [];
  const bearishEvidence: string[] = [];
  const conflicts: string[] = [];

  // =========================================================================
  // CANONICAL 7-FACTOR SCORING MODEL (Total Exactly 100 Pts Independent)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Factor A: Higher-Timeframe Alignment (Max 20 pts: 4H 10 pts + 1H 10 pts)
  // -------------------------------------------------------------------------
  let htfBullish = 0;
  let htfBearish = 0;

  const macro4hDir = direction(
    extraction?.macroTrend?.state ||
    extraction?.higherTimeframe?.trend4h ||
    extraction?.timeframeAnalysis?.["4h"]?.bias ||
    extraction?.timeframeAnalysis?.["4h"]?.structure
  );
  if (macro4hDir === "bullish") {
    htfBullish += 10;
    bullishEvidence.push("Higher-Timeframe 4H Macro Trend is Bullish (+10)");
  } else if (macro4hDir === "bearish") {
    htfBearish += 10;
    bearishEvidence.push("Higher-Timeframe 4H Macro Trend is Bearish (+10)");
  }

  const conf1hDir = direction(
    extraction?.confirmationTrend?.state ||
    extraction?.higherTimeframe?.trend1h ||
    extraction?.timeframeAnalysis?.["1h"]?.bias ||
    extraction?.timeframeAnalysis?.["1h"]?.structure
  );
  if (conf1hDir === "bullish") {
    htfBullish += 10;
    bullishEvidence.push("Higher-Timeframe 1H Confirmation Trend is Bullish (+10)");
  } else if (conf1hDir === "bearish") {
    htfBearish += 10;
    bearishEvidence.push("Higher-Timeframe 1H Confirmation Trend is Bearish (+10)");
  }

  // -------------------------------------------------------------------------
  // Factor B: Market Structure (Max 20 pts)
  // -------------------------------------------------------------------------
  let structBullish = 0;
  let structBearish = 0;
  const structDir = trendDirection(extraction);
  if (structDir === "bullish") {
    structBullish = 20;
    bullishEvidence.push("5M Market Structure is Bullish (HH/HL) (+20)");
  } else if (structDir === "bearish") {
    structBearish = 20;
    bearishEvidence.push("5M Market Structure is Bearish (LH/LL) (+20)");
  } else {
    // Neutral/transition structure provides baseline 5 pts
    structBullish = 5;
    structBearish = 5;
  }

  // -------------------------------------------------------------------------
  // Factor C: Momentum (Max 15 pts: RSI 8 pts + MACD 7 pts)
  // -------------------------------------------------------------------------
  let momBullish = 0;
  let momBearish = 0;

  const rsi = indicators.RSI;
  const rsiDir = rsiDirection(rsi);
  if (rsiDir === "bullish") {
    momBullish += 8;
    bullishEvidence.push("RSI Momentum in Bullish Expansion (+8)");
  } else if (rsiDir === "bearish") {
    momBearish += 8;
    bearishEvidence.push("RSI Momentum in Bearish Expansion (+8)");
  }

  const macd = indicators.MACD;
  const macdDir = macdDirection(macd);
  if (macdDir === "bullish") {
    momBullish += 7;
    bullishEvidence.push("MACD Histogram/Cross confirms Bullish Momentum (+7)");
  } else if (macdDir === "bearish") {
    momBearish += 7;
    bearishEvidence.push("MACD Histogram/Cross confirms Bearish Momentum (+7)");
  }

  // Fallback to extraction momentum if indicators missing
  if (!rsi && !macd) {
    const genericMom = direction(extraction?.momentum?.state);
    if (genericMom === "bullish") {
      momBullish = 15;
      bullishEvidence.push("Momentum is Bullish (+15)");
    } else if (genericMom === "bearish") {
      momBearish = 15;
      bearishEvidence.push("Momentum is Bearish (+15)");
    }
  }

  // -------------------------------------------------------------------------
  // Factor D: Entry Location (Max 15 pts: EMA Stack or Bollinger Position)
  // -------------------------------------------------------------------------
  let locBullish = 0;
  let locBearish = 0;

  const ema = indicators.EMA;
  const emaDir = emaDirection(ema);
  const bb = indicators["Bollinger Bands"] || indicators.BollingerBands;
  const bbDir = bbDirection(bb, price);

  if (emaDir === "bullish") {
    locBullish = 15;
    bullishEvidence.push("Price positioned above Bullish EMA stack (+15)");
  } else if (emaDir === "bearish") {
    locBearish = 15;
    bearishEvidence.push("Price positioned below Bearish EMA stack (+15)");
  } else if (bbDir === "bullish") {
    locBullish = 12;
    bullishEvidence.push("Price interacting favorably with Bollinger Bands (+12)");
  } else if (bbDir === "bearish") {
    locBearish = 12;
    bearishEvidence.push("Price interacting favorably with Bollinger Bands (+12)");
  }

  // -------------------------------------------------------------------------
  // Factor E: Support / Resistance (Max 10 pts)
  // -------------------------------------------------------------------------
  let srBullish = 0;
  let srBearish = 0;
  const lvlDir = levelDirection(extraction, price);
  if (lvlDir === "bullish") {
    srBullish = 10;
    bullishEvidence.push("Support floor bounce confirmed with clear headroom (+10)");
  } else if (lvlDir === "bearish") {
    srBearish = 10;
    bearishEvidence.push("Resistance ceiling rejection confirmed with clear room below (+10)");
  }

  // -------------------------------------------------------------------------
  // Factor F: Risk / Reward (Max 10 pts)
  // -------------------------------------------------------------------------
  let rrBullish = 0;
  let rrBearish = 0;
  const rawRr = number(
    extraction?.riskReward ??
    extraction?.riskRewardRatio ??
    extraction?.risk?.riskRewardRatio ??
    extraction?.risk?.buy?.riskRewardRatio ??
    extraction?.risk?.sell?.riskRewardRatio
  );
  if (rawRr !== null && rawRr >= 1.5) {
    if (structBullish >= structBearish) rrBullish = 10;
    if (structBearish >= structBullish) rrBearish = 10;
    bullishEvidence.push(`Calculated Risk/Reward (${rawRr.toFixed(2)}) is optimal (>= 1.5) (+10)`);
  } else if (rawRr !== null && rawRr >= 1.1) {
    if (structBullish >= structBearish) rrBullish = 5;
    if (structBearish >= structBullish) rrBearish = 5;
    bullishEvidence.push(`Calculated Risk/Reward (${rawRr.toFixed(2)}) is acceptable (>= 1.1) (+5)`);
  }

  // -------------------------------------------------------------------------
  // Factor G: Entry Confirmation (Max 10 pts)
  // -------------------------------------------------------------------------
  let confBullish = 0;
  let confBearish = 0;
  const cDir = candleDirection(extraction?.candles);
  if (cDir === "bullish") {
    confBullish = 10;
    bullishEvidence.push("Trigger candle shows strong buyer rejection/expansion (+10)");
  } else if (cDir === "bearish") {
    confBearish = 10;
    bearishEvidence.push("Trigger candle shows strong seller rejection/expansion (+10)");
  }

  // =========================================================================
  // TOTAL SCORE COMPUTATION (NEVER redistribute missing weights)
  // Missing factors contribute 0 points.
  // =========================================================================
  const bullishScore = Math.min(100, Math.max(0, htfBullish + structBullish + momBullish + locBullish + srBullish + rrBullish + confBullish));
  const bearishScore = Math.min(100, Math.max(0, htfBearish + structBearish + momBearish + locBearish + srBearish + rrBearish + confBearish));

  const quality = confidence(extraction?.extractionConfidence || extraction?.visualQuality?.overallConfidence);
  
  // Trade quality independent from directional score
  let tradeQuality = 40;
  if (quality >= 70) tradeQuality += 20;
  if (rawRr !== null && rawRr >= 1.5) tradeQuality += 20;
  else if (rawRr !== null && rawRr >= 1.1) tradeQuality += 10;
  if (lvlDir !== null) tradeQuality += 10;
  if (cDir !== null) tradeQuality += 10;
  tradeQuality = Math.min(100, tradeQuality);

  const strongest = Math.max(bullishScore, bearishScore);
  const weakest = Math.min(bullishScore, bearishScore);
  const gap = strongest - weakest;
  const directionConfidence = Math.min(100, strongest * 0.65 + gap * 0.35);
  const confidenceScore = Math.round(quality * 0.45 + directionConfidence * 0.55);

  if (bullishScore > 0 && bearishScore > 0) {
    if (htfBullish > 0 && htfBearish > 0) conflicts.push("Higher-Timeframe trends conflict between 4H and 1H.");
    if (structDir && cDir && structDir !== cDir) conflicts.push("Trigger candle conflicts with 5M market structure.");
    if (rsiDir && macdDir && rsiDir !== macdDir) conflicts.push("RSI and MACD momentum directions conflict.");
  }

  // =========================================================================
  // CANONICAL SIGNAL THRESHOLDS
  // BUY: BUY_SCORE >= 75 AND BUY_SCORE >= SELL_SCORE + 10 AND tradeQuality >= 70 AND RR >= 1.1
  // SELL: SELL_SCORE >= 75 AND SELL_SCORE >= BUY_SCORE + 10 AND tradeQuality >= 70 AND RR >= 1.1
  // STRONG_BUY: BUY_SCORE >= 85 AND gap >= 20 AND tradeQuality >= 80 AND RR >= 1.5
  // STRONG_SELL: SELL_SCORE >= 85 AND gap >= 20 AND tradeQuality >= 80 AND RR >= 1.5
  // Otherwise: WAIT
  // =========================================================================
  let signal: MobileSignalRulesResult["signal"] = "WAIT";

  const isBuyValid = bullishScore >= 75 && bullishScore >= bearishScore + 10 && tradeQuality >= 70 && (rawRr === null || rawRr >= 1.1);
  const isSellValid = bearishScore >= 75 && bearishScore >= bullishScore + 10 && tradeQuality >= 70 && (rawRr === null || rawRr >= 1.1);

  if (isBuyValid) {
    signal = bullishScore >= 85 && gap >= 20 && tradeQuality >= 80 && (rawRr === null || rawRr >= 1.5) && confBullish > 0 ? "STRONG_BUY" : "BUY";
  } else if (isSellValid) {
    signal = bearishScore >= 85 && gap >= 20 && tradeQuality >= 80 && (rawRr === null || rawRr >= 1.5) && confBearish > 0 ? "STRONG_SELL" : "SELL";
  } else {
    signal = "WAIT";
  }

  const trend = bullishScore >= 55 && bullishScore > bearishScore + 10 ? "Bullish" : bearishScore >= 55 && bearishScore > bullishScore + 10 ? "Bearish" : "Sideways";

  const evidenceCount = [
    htfBullish || htfBearish,
    structBullish || structBearish,
    momBullish || momBearish,
    locBullish || locBearish,
    srBullish || srBearish,
    rrBullish || rrBearish,
    confBullish || confBearish,
  ].filter(Boolean).length;

  return {
    signal,
    trend,
    bullishScore,
    bearishScore,
    confidence: Math.max(1, Math.min(100, confidenceScore)),
    tradeQuality,
    availableWeight: 100,
    evidenceCount,
    bullishEvidence,
    bearishEvidence,
    conflicts: Array.from(new Set(conflicts)).slice(0, 6),
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
  };
}

