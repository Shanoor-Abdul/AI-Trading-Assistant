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
  availableWeight: number;
  evidenceCount: number;
  bullishEvidence: string[];
  bearishEvidence: string[];
  conflicts: string[];
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
  if (!v || v === "unknown" || v === "neutral" || v === "sideways" || v === "mixed") return null;
  if (/bullish|bull|upward|rising|rise|positive|higher|buy|long/.test(v)) return "bullish";
  if (/bearish|bear|downward|falling|fall|negative|lower|sell|short/.test(v)) return "bearish";
  return null;
}

function add(items: ScoreItem[], item: ScoreItem): void {
  if (item.direction && item.confidence > 0) items.push(item);
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
  
  // Parse and sort EMA keys by numeric period (e.g., "EMA9" -> 9, "EMA50" -> 50)
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

  // Prefer the primary RSI value. Stage 1 sets `value` to the first/fast
  // series when multiple RSI values are printed, but keep fallbacks for older
  // extraction responses that only returned rsi1/rsi2/rsi3.
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

function momentumDirection(extraction: any): Direction | null {
  return direction(extraction?.momentum?.state);
}

function levelDirection(extraction: any, price: number | null): Direction | null {
  if (price === null) return null;
  const supports = Array.isArray(extraction?.supportLevels) ? extraction.supportLevels : [];
  const resistances = Array.isArray(extraction?.resistanceLevels) ? extraction.resistanceLevels : [];
  
  // Tightened strict threshold for 5-minute precision (0.0003 ~ 3 Pips instead of 22 Pips)
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
  const items: ScoreItem[] = [];

  add(items, { key: "trend", label: "Trend / market structure", direction: trendDirection(extraction), weight: 20, confidence: confidence(extraction?.trend?.confidence || extraction?.marketStructure?.confidence), evidence: `Trend/structure: ${extraction?.trend?.state || extraction?.marketStructure?.state}.` });

  const ema = indicators.EMA;
  const emaEntries = ema && typeof ema === "object" ? Object.values(ema).filter((x: any) => x && typeof x === "object") as any[] : [];
  const emaConfidence = emaEntries.length ? Math.max(...emaEntries.map((x: any) => confidence(x.confidence))) : 0;
  add(items, { key: "ema", label: "Moving-average alignment", direction: emaDirection(ema), weight: 15, confidence: emaConfidence, evidence: "Visible EMA/MA alignment supports the direction." });

  const rsi = indicators.RSI;
  const rsiDir = rsiDirection(rsi);
  if (rsi && rsi.visible !== false) {
    // Keep heavy tracking weight (15) even on extremes to optimize sniper binary triggers
    let rsiWeight = 15; 
    const rsiValue = number(rsi.value ?? rsi.approximateValue ?? rsi.rsi1 ?? rsi.rsi2 ?? rsi.rsi3);
    const rsiConf = confidence(rsi.confidence);
    
    const multi = [rsi.rsi1, rsi.rsi2, rsi.rsi3].map(number).filter((x): x is number => x !== null);
    const multiText = multi.length > 1 ? ` (${multi.map((v, index) => `RSI${index + 1} ${v}`).join(", ")})` : "";
    add(items, { key: "rsi", label: "RSI momentum", direction: rsiDir, weight: rsiWeight, confidence: rsiConf, evidence: rsiValue !== null ? `RSI ${rsiValue}${multiText}${rsi.direction ? `, ${rsi.direction}` : ""}.` : `RSI ${rsi.direction || rsi.zone || "visible"}.` });
  }

  const macd = indicators.MACD;
  const macdDir = macdDirection(macd);
  if (macd && macd.visible !== false) {
    add(items, { key: "macd", label: "MACD momentum", direction: macdDir, weight: 15, confidence: confidence(macd.confidence), evidence: `MACD: ${macd.cross || macd.lineRelationship || macd.histogramDirection || macd.state || "visible"}.` });
  }

  const bb = indicators["Bollinger Bands"] || indicators.BollingerBands;
  const bbDir = bbDirection(bb, price);
  if (bb && bb.visible !== false) {
    let bbWeight = 10;
    const cross = text(bb.crossDirection || bb.middleCross);
    const close = text(bb.candleCloseConfirmation);
    if ((/up|bull/.test(cross) && /confirm|yes|above/.test(close)) || (/down|bear/.test(cross) && /confirm|yes|below/.test(close))) bbWeight = 12;
    const bbNumbers = [bb.upper, bb.middle, bb.lower].map(number).filter((x): x is number => x !== null);
    const bbText = bbNumbers.length === 3 ? `; bands ${bbNumbers.join(" / ")}` : "";
    add(items, { key: "bb", label: "Bollinger position / middle-band cross", direction: bbDir, weight: bbWeight, confidence: confidence(bb.confidence), evidence: `Bollinger: ${bb.position || "position unknown"}; cross ${bb.middleCross || "unknown"}; width ${bb.width || "unknown"}${bbText}.` });
  }

  const candles = extraction?.candles;
  add(items, { key: "candle", label: "Candlestick / price action", direction: candleDirection(candles), weight: 10, confidence: confidence(candles?.confidence), evidence: `Candles: ${candles?.latest?.pattern || candles?.recentDirection || candles?.priceAction || "visible"}.` });
  add(items, { key: "momentum", label: "Momentum", direction: momentumDirection(extraction), weight: 10, confidence: confidence(extraction?.momentum?.confidence), evidence: `Momentum: ${extraction?.momentum?.state || "visible"}.` });
  add(items, { key: "levels", label: "Support / resistance", direction: levelDirection(extraction, price), weight: 10, confidence: 50, evidence: "Price is interacting with a nearby extracted support/resistance level." });

  const availableWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const bullishPoints = items.filter(x => x.direction === "bullish").reduce((sum, x) => sum + x.weight * x.confidence / 100, 0);
  const bearishPoints = items.filter(x => x.direction === "bearish").reduce((sum, x) => sum + x.weight * x.confidence / 100, 0);
  const bullishScore = availableWeight ? Math.round((bullishPoints / availableWeight) * 100) : 0;
  const bearishScore = availableWeight ? Math.round((bearishPoints / availableWeight) * 100) : 0;
  const evidenceCount = items.length;
  const quality = confidence(extraction?.extractionConfidence || extraction?.visualQuality?.overallConfidence);
  const strongest = Math.max(bullishScore, bearishScore);
  const weakest = Math.min(bullishScore, bearishScore);
  const gap = strongest - weakest;
  const directionConfidence = Math.min(100, strongest * 0.65 + gap * 0.35);
  const confidenceScore = Math.round(quality * 0.45 + directionConfidence * 0.55);

  const hasBull = bullishPoints > 0;
  const hasBear = bearishPoints > 0;
  const conflicts = items.filter(x => x.direction && ((x.direction === "bullish" && hasBear) || (x.direction === "bearish" && hasBull))).map(x => `${x.label} conflicts with other directional evidence.`);
  const hasMinimumEvidence = evidenceCount >= 3 && availableWeight >= 45;

  let signal: MobileSignalRulesResult["signal"] = "WAIT";
  if (hasMinimumEvidence && bullishScore >= 70 && bullishScore - bearishScore >= 15) signal = bullishScore >= 85 && gap >= 20 ? "STRONG_BUY" : "BUY";
  if (hasMinimumEvidence && bearishScore >= 70 && bearishScore - bullishScore >= 15) signal = bearishScore >= 85 && gap >= 20 ? "STRONG_SELL" : "SELL";

  const trend = bullishScore >= 55 && bullishScore > bearishScore + 10 ? "Bullish" : bearishScore >= 55 && bearishScore > bullishScore + 10 ? "Bearish" : "Sideways";

  return {
    signal,
    trend,
    bullishScore,
    bearishScore,
    confidence: Math.max(1, Math.min(100, confidenceScore)),
    availableWeight,
    evidenceCount,
    bullishEvidence: items.filter(x => x.direction === "bullish").map(x => `${x.label} (+${x.weight}): ${x.evidence}`),
    bearishEvidence: items.filter(x => x.direction === "bearish").map(x => `${x.label} (+${x.weight}): ${x.evidence}`),
    conflicts: Array.from(new Set(conflicts)).slice(0, 6),
  };
}
