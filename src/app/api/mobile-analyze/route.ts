import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { analyze as analyzeGemini } from "@/lib/ai/providers/gemini";
import { analyze as analyzeOpenAI } from "@/lib/ai/providers/openai";
import { analyze as analyzeGroq } from "@/lib/ai/providers/groq";
import { analyze as analyzeOpenRouter } from "@/lib/ai/providers/openrouter";
import { analyze as analyzeAnthropic } from "@/lib/ai/providers/anthropic";
import { UniversalAIRequestSchema, UniversalAIResponseSchema } from "@/lib/ai/schema";
import { getModelCapabilities } from "@/lib/ai/providerCapabilities";
import { buildMobileExtractionPrompt } from "@/lib/ai/mobileExtractionPrompt";
import { buildMobileSignalPrompt } from "@/lib/ai/mobileSignalPrompt";
import { calculateMobileSignalConfidence, calculateMobileSignalRules } from "@/lib/ai/mobileSignalConfidence";
import { EMA, RSI, MACD, BollingerBands, ATR } from "technicalindicators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageData = { mimeType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

function getMimeAndBase64(value: string): ImageData {
  if (value.startsWith("data:image/")) {
    const [header, data] = value.split(";base64,");
    const mime = header.replace("data:", "");
    if (data && (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp")) return { mimeType: mime, base64: data };
  }
  return { mimeType: "image/jpeg", base64: value };
}

async function callProvider(req: any) {
  switch (req.provider) {
    case "gemini": return analyzeGemini(req);
    case "openai": return analyzeOpenAI(req);
    case "groq": return analyzeGroq(req);
    case "openrouter": return analyzeOpenRouter(req);
    case "anthropic": return analyzeAnthropic(req);
    default: throw new Error(`AI_PROVIDER_UNAVAILABLE: ${req.provider}`);
  }
}

function hasKnownState(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.toUpperCase() !== "UNKNOWN";
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const normalized = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function hasExtractionEvidence(extraction: any): boolean {
  if (!extraction || typeof extraction !== "object") return false;
  const indicators = extraction.indicators && typeof extraction.indicators === "object" ? Object.values(extraction.indicators) : [];
  const indicatorEvidence = indicators.some((x: any) => x && typeof x === "object" && (
    x.visible === true || x.value != null || x.approximateValue != null || x.macd != null || x.signal != null || x.histogram != null ||
    hasKnownState(x.state) || hasKnownState(x.position) || hasKnownState(x.zone) || hasKnownState(x.direction)
  ));
  return Boolean(
    extraction.currentPrice?.value != null || extraction.candles?.latest?.close != null ||
    hasKnownState(extraction.trend?.state) || hasKnownState(extraction.momentum?.state) || hasKnownState(extraction.marketStructure?.state) ||
    extraction.visualEvidence?.length || extraction.supportLevels?.length || extraction.resistanceLevels?.length ||
    extraction.visualQuality?.overallConfidence > 0 || normalizeConfidence(extraction.extractionConfidence) > 0 || indicatorEvidence
  );
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function observation(value: unknown, confidence = 0) {
  return { value: num(value), source: "visual" as const, confidence: normalizeConfidence(confidence) };
}

function levels(value: any): any[] {
  if (!Array.isArray(value)) return [];
  return value.map((x: any) => {
    const n = num(typeof x === "number" ? x : x?.value ?? x?.price);
    return n == null ? null : {
      value: n, price: n,
      type: typeof x?.type === "string" ? x.type : undefined,
      strength: Number(x?.strength) || 0,
      confidence: normalizeConfidence(x?.confidence),
    };
  }).filter(Boolean);
}

function indicatorConfidence(indicator: any): number {
  if (!indicator || typeof indicator !== "object") return 0;
  return normalizeConfidence(indicator.confidence);
}

/**
 * Normalize Stage-1 indicators into the exact shape expected by IndicatorSetSchema.
 * In particular EMA is a RECORD of named indicator observations, not a single
 * observation. This prevents responses such as { EMA: { confidence: 72 } } from
 * reaching Zod and producing "EMA.confidence expected object, received number".
 */
function normalizeIndicators(raw: any): Record<string, any> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const output: Record<string, any> = {};

  for (const [name, value] of Object.entries(raw)) {
    if (name === "EMA") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        output.EMA = {};
        continue;
      }
      const emaEntries: Record<string, any> = {};
      for (const [emaName, emaValue] of Object.entries(value as Record<string, any>)) {
        if (!emaValue || typeof emaValue !== "object" || Array.isArray(emaValue)) continue;
        emaEntries[emaName] = {
          ...emaValue,
          value: emaValue.value == null ? null : num(emaValue.value),
          state: typeof emaValue.state === "string" ? emaValue.state : "UNKNOWN",
          visible: emaValue.visible === true,
          confidence: indicatorConfidence(emaValue),
          source: (emaValue as Record<string, any>).source === "api" || (emaValue as Record<string, any>).source === "hybrid" ? (emaValue as Record<string, any>).source : "visual",
        };
      }
      output.EMA = emaEntries;
      continue;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    output[name] = {
      ...value,
      confidence: indicatorConfidence(value),
      source: (value as Record<string, any>).source === "api" || (value as Record<string, any>).source === "hybrid" ? (value as Record<string, any>).source : "visual",
    };
  }

  return output;
}

function mergeExtraction(result: any, extraction: any, req: any): any {
  const existing = result?.unifiedMarketData && typeof result.unifiedMarketData === "object" ? result.unifiedMarketData : {};
  const candle = extraction?.candles?.latest && typeof extraction.candles.latest === "object" ? extraction.candles.latest : null;
  const visualEvidence = Array.isArray(extraction?.visualEvidence) ? extraction.visualEvidence.filter((x: any) => typeof x === "string" && x.trim()) : [];
  const normalizedIndicators = normalizeIndicators(extraction?.indicators);

  const indicatorEvidence = Object.entries(normalizedIndicators).flatMap(([name, x]: [string, any]) => {
    if (name === "EMA") {
      return Object.entries(x || {}).flatMap(([emaName, ema]: [string, any]) => {
        if (!ema || typeof ema !== "object") return [];
        const facts: string[] = [];
        if (ema.visible === true) facts.push(`${emaName} is visible.`);
        if (hasKnownState(ema.state)) facts.push(`${emaName} state: ${ema.state}.`);
        if (ema.value != null) facts.push(`${emaName} value: ${ema.value}.`);
        return facts;
      });
    }
    if (!x || typeof x !== "object") return [];
    const facts: string[] = [];
    if (x.visible === true) facts.push(`${name} is visible.`);
    if (hasKnownState(x.state)) facts.push(`${name} state: ${x.state}.`);
    if (hasKnownState(x.position)) facts.push(`${name} position: ${x.position}.`);
    if (hasKnownState(x.zone)) facts.push(`${name} zone: ${x.zone}.`);
    if (hasKnownState(x.direction)) facts.push(`${name} direction: ${x.direction}.`);
    if (hasKnownState(x.nearestBand)) facts.push(`${name} nearest band: ${x.nearestBand}.`);
    if (hasKnownState(x.width)) facts.push(`${name} width: ${x.width}.`);
    if (x.value != null) facts.push(`${name} value: ${x.value}.`);
    if (x.approximateValue != null) facts.push(`${name} approximate value: ${x.approximateValue}.`);
    if (x.macd != null) facts.push(`MACD value: ${x.macd}.`);
    if (x.signal != null) facts.push(`MACD signal: ${x.signal}.`);
    if (x.histogram != null) facts.push(`MACD histogram: ${x.histogram}.`);
    return facts;
  });

  const extractionConfidence = normalizeConfidence(extraction?.extractionConfidence);
  const visualQualityConfidence = normalizeConfidence(extraction?.visualQuality?.overallConfidence);
  const currentPriceConfidence = normalizeConfidence(extraction?.currentPrice?.confidence);
  const candleConfidence = normalizeConfidence(extraction?.candles?.confidence);
  const requestedIndicators = Array.isArray(req.visibleIndicators) ? req.visibleIndicators : [];
  const requestedIndicatorScores = requestedIndicators.map((name: string) => indicatorConfidence(normalizedIndicators[name])).filter((x: number) => x > 0);
  const indicatorScore = requestedIndicatorScores.length ? Math.round(requestedIndicatorScores.reduce((sum: number, score: number) => sum + score, 0) / requestedIndicatorScores.length) : 0;
  const evidenceScore = visualEvidence.length > 0 ? Math.min(100, 45 + visualEvidence.length * 8) : 0;
  const computedExtractionConfidence = extractionConfidence || Math.round(
    [visualQualityConfidence, currentPriceConfidence, candleConfidence, indicatorScore, evidenceScore]
      .filter((x) => x > 0).reduce((sum, score, _, arr) => sum + score / arr.length, 0),
  );

  const unified = {
    symbol: extraction?.symbol || req.symbol || "",
    timeframe: extraction?.timeframe || req.primaryTimeframe || "",
    ...existing,
    currentPrice: existing.currentPrice?.value != null ? existing.currentPrice : observation(extraction?.currentPrice?.value, currentPriceConfidence),
    completedCandle: existing.completedCandle ?? (candle ? { open: num(candle.open), high: num(candle.high), low: num(candle.low), close: num(candle.close), complete: candle.complete !== false } : null),
    // IMPORTANT: Stage 1 is the source of truth for visual indicators. Do not
    // preserve Stage-2's malformed EMA shape here.
    indicators: normalizedIndicators,
    supportLevels: existing.supportLevels?.value?.length ? existing.supportLevels : { value: levels(extraction?.supportLevels), source: "visual", confidence: 50 },
    resistanceLevels: existing.resistanceLevels?.value?.length ? existing.resistanceLevels : { value: levels(extraction?.resistanceLevels), source: "visual", confidence: 50 },
    marketStructure: existing.marketStructure?.value != null ? existing.marketStructure : { value: extraction?.marketStructure?.state ?? null, source: "visual", confidence: normalizeConfidence(extraction?.marketStructure?.confidence) },
    trend: existing.trend?.value != null ? existing.trend : { value: extraction?.trend?.state ?? null, source: "visual", confidence: normalizeConfidence(extraction?.trend?.confidence) },
    momentum: existing.momentum?.value != null ? existing.momentum : { value: extraction?.momentum?.state ?? null, source: "visual", confidence: normalizeConfidence(extraction?.momentum?.confidence) },
    swingHigh: existing.swingHigh?.value != null ? existing.swingHigh : observation(extraction?.swingHigh, 50),
    swingLow: existing.swingLow?.value != null ? existing.swingLow : observation(extraction?.swingLow, 50),
    breakoutLevel: existing.breakoutLevel?.value != null ? existing.breakoutLevel : observation(extraction?.breakoutLevel, 50),
    invalidationLevel: existing.invalidationLevel?.value != null ? existing.invalidationLevel : observation(extraction?.invalidationLevel, 50),
    extractionConfidence: computedExtractionConfidence,
    visualQuality: extraction?.visualQuality || null,
    evidenceGroups: {
      ...(existing.evidenceGroups || {}),
      indicators: Array.from(new Set([...(existing.evidenceGroups?.indicators || []), ...indicatorEvidence])),
      candle: Array.from(new Set([...(existing.evidenceGroups?.candle || []), ...(candle ? [extraction?.candles?.behavior || "Visible candle behavior extracted."] : [])])),
    },
  };

  const evidence = [...visualEvidence, ...indicatorEvidence];
  return {
    ...result,
    unifiedMarketData: unified,
    requestedIndicators: result?.requestedIndicators?.length ? result.requestedIndicators : (req.visibleIndicators || []),
    reasoning: result?.reasoning && result.reasoning !== "No reasoning provided" ? result.reasoning : `Visual evidence extracted: ${evidence.slice(0, 8).join("; ")}`,
    explanation: result?.explanation || `Mobile chart analysis based on extracted visual evidence: ${evidence.slice(0, 8).join("; ")}`,
    bullishEvidence: result?.bullishEvidence?.length ? result.bullishEvidence : (extraction?.trend?.state === "Bullish" ? evidence.slice(0, 6) : []),
    bearishEvidence: result?.bearishEvidence?.length ? result.bearishEvidence : (extraction?.trend?.state === "Bearish" ? evidence.slice(0, 6) : []),
    invalidationConditions: result?.invalidationConditions?.length ? result.invalidationConditions : (extraction?.invalidationLevel != null ? [`Visual invalidation level: ${extraction.invalidationLevel}`] : []),
  };
}

function hasFinalEvidence(result: any): boolean {
  const u = result?.unifiedMarketData;
  const text = [result?.reasoning, result?.explanation, result?.marketState].some((x: any) => typeof x === "string" && x.trim() && x !== "No reasoning provided");
  const data = Boolean(u?.currentPrice?.value != null || u?.completedCandle?.close != null || (u?.indicators && Object.keys(u.indicators).length) || u?.trend?.value || u?.momentum?.value || u?.marketStructure?.value || u?.supportLevels?.value?.length || u?.resistanceLevels?.value?.length || u?.extractionConfidence > 0);
  return text && data;
}

export async function POST(request: NextRequest) {
  const started = performance.now();
  try {
    const body = await request.json();
    let rawImage = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
    let extractedTextData = body?.extractedTextData;

    if (body.dataSource === "twelvedata") {
      const apiKey = process.env.TWELVEDATA_API_KEY;
      if (!apiKey) throw new Error("TWELVEDATA_API_KEY is not configured.");

      const symbol = body.symbol ? body.symbol.replace(/\s*\(OTC\)/gi, '').trim() : "EUR/USD";
      const executionTf = body.timeframe || "5m";
      
      const intervalMap: Record<string, string> = {
        "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day"
      };
      const execInterval = intervalMap[executionTf] || "5min";

      const baseUrl = `https://api.twelvedata.com`;
      const safeFetchSeries = async (interval: string, size = 60) => {
        try {
          const url = `${baseUrl}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${size}&apikey=${apiKey}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data?.status === "error" || !Array.isArray(data?.values) || data.values.length === 0) {
            return { success: false, message: data?.message || "No candle data returned", values: [] as any[] };
          }
          return { success: true, message: "", values: data.values as any[] };
        } catch (err: any) {
          return { success: false, message: err?.message || "Fetch failed", values: [] as any[] };
        }
      };

      // Fetch primary execution timeframe series and parallel query for 1H and 4H macro contexts (3 API calls total instead of 19)
      const [execRes, tf1hRes, tf4hRes] = await Promise.all([
        safeFetchSeries(execInterval, 60),
        safeFetchSeries("1h", 50),
        safeFetchSeries("4h", 50)
      ]);

      if (!execRes.success || !execRes.values.length) {
        throw new Error(`TwelveData API error: ${execRes.message || `Failed to retrieve price series for ${symbol} on ${executionTf}`}. If using the free tier (8 calls/min), please retry in 10-15 seconds.`);
      }

      // 1. Calculate 5M / Execution Local Indicators with Mathematical Precision
      const chronExec = [...execRes.values].reverse();
      const closePrices = chronExec.map((c: any) => parseFloat(c.close));
      const highPrices = chronExec.map((c: any) => parseFloat(c.high));
      const lowPrices = chronExec.map((c: any) => parseFloat(c.low));
      const currentPrice = closePrices[closePrices.length - 1];

      // Local technical indicators calculation
      const ema20Arr = EMA.calculate({ period: 20, values: closePrices });
      const ema50Arr = EMA.calculate({ period: 50, values: closePrices });
      const ema200Arr = closePrices.length >= 200 ? EMA.calculate({ period: 200, values: closePrices }) : [];
      const rsiArr = RSI.calculate({ period: 14, values: closePrices });
      const macdArr = MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false, values: closePrices });
      const bbArr = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });
      const atrArr = ATR.calculate({ period: 14, high: highPrices, low: lowPrices, close: closePrices });

      const ema20 = ema20Arr.length ? ema20Arr[ema20Arr.length - 1].toFixed(4) : 'N/A';
      const ema50 = ema50Arr.length ? ema50Arr[ema50Arr.length - 1].toFixed(4) : 'N/A';
      const ema200 = ema200Arr.length ? ema200Arr[ema200Arr.length - 1].toFixed(4) : 'N/A';
      const currentRsi = rsiArr.length ? rsiArr[rsiArr.length - 1].toFixed(2) : 'N/A';
      const rsiChange = rsiArr.length >= 3 ? (rsiArr[rsiArr.length - 1] - rsiArr[rsiArr.length - 3]).toFixed(2) : 'N/A';
      const macdVal = macdArr.length ? Number(macdArr[macdArr.length - 1].MACD).toFixed(4) : 'N/A';
      const macdSignalVal = macdArr.length ? Number(macdArr[macdArr.length - 1].signal).toFixed(4) : 'N/A';
      const macdHistVal = macdArr.length ? Number(macdArr[macdArr.length - 1].histogram).toFixed(4) : 'N/A';
      const atr5m = atrArr.length ? atrArr[atrArr.length - 1].toFixed(4) : 'N/A';

      let macdSlope = "Flat";
      if (macdArr.length >= 3) {
        const h0 = Number(macdArr[macdArr.length - 3].histogram);
        const h1 = Number(macdArr[macdArr.length - 2].histogram);
        const h2 = Number(macdArr[macdArr.length - 1].histogram);
        if (h2 > h1 && h1 > h0) macdSlope = "Rising";
        else if (h2 < h1 && h1 < h0) macdSlope = "Falling";
        else if (h2 > 0 && h1 < 0) macdSlope = "Bullish Cross";
        else if (h2 < 0 && h1 > 0) macdSlope = "Bearish Cross";
      }

      // 5-Candle Anatomy
      const recent5Raw = execRes.values.slice(0, 5);
      const fiveCandles = [...recent5Raw].reverse().map((c: any, idx: number) => {
        const o = parseFloat(c.open);
        const h = parseFloat(c.high);
        const l = parseFloat(c.low);
        const cl = parseFloat(c.close);
        const range = Math.max(0.00001, h - l);
        const body = Math.abs(cl - o);
        const upperWick = h - Math.max(o, cl);
        const lowerWick = Math.min(o, cl) - l;
        const bodyPct = parseFloat(((body / range) * 100).toFixed(1));
        const upperWickPct = parseFloat(((upperWick / range) * 100).toFixed(1));
        const lowerWickPct = parseFloat(((lowerWick / range) * 100).toFixed(1));
        const isBullish = cl >= o;
        
        let patternTag = "NEUTRAL_BODY";
        if (bodyPct <= 20) patternTag = "DOJI_INDECISION";
        else if (isBullish && lowerWickPct >= 50 && bodyPct <= 35) patternTag = "BULLISH_HAMMER_REJECTION";
        else if (!isBullish && upperWickPct >= 50 && bodyPct <= 35) patternTag = "BEARISH_SHOOTING_STAR_REJECTION";
        else if (isBullish && bodyPct >= 65) patternTag = "BULLISH_EXPANSION";
        else if (!isBullish && bodyPct >= 65) patternTag = "BEARISH_EXPANSION";

        return {
          candleIndex: idx + 1,
          time: c.datetime,
          open: o,
          high: h,
          low: l,
          close: cl,
          direction: isBullish ? "BULLISH" : "BEARISH",
          bodyPct: `${bodyPct}%`,
          upperWickPct: `${upperWickPct}%`,
          lowerWickPct: `${lowerWickPct}%`,
          patternTag
        };
      });

      const r1 = execRes.values?.length ? Math.max(...execRes.values.slice(0, 20).map((v: any) => parseFloat(v.high))) : null;
      const s1 = execRes.values?.length ? Math.min(...execRes.values.slice(0, 20).map((v: any) => parseFloat(v.low))) : null;
      const pipMultiplier = (symbol.includes("JPY") || symbol.includes("XAU") || symbol.includes("XAG")) ? 100 : 10000;
      
      const pipsUnderResistance = (r1 && currentPrice != null) ? ((r1 - currentPrice) * pipMultiplier).toFixed(1) : 'N/A';
      const pipsAboveSupport = (s1 && currentPrice != null) ? ((currentPrice - s1) * pipMultiplier).toFixed(1) : 'N/A';

      let maAlignment = "ENTANGLED_CHOP";
      if (currentPrice != null && ema20 !== 'N/A' && ema50 !== 'N/A') {
        const cp = currentPrice;
        const e20 = Number(ema20);
        const e50 = Number(ema50);
        if (cp > e20 && e20 > e50) maAlignment = "FULL_BULLISH_STACK (Price > EMA20 > EMA50)";
        else if (cp < e20 && e20 < e50) maAlignment = "FULL_BEARISH_STACK (Price < EMA20 < EMA50)";
        else if (e20 > cp && cp > e50) maAlignment = "BULLISH_PULLBACK_ZONE (EMA20 > Price > EMA50)";
        else if (e20 < cp && cp < e50) maAlignment = "BEARISH_PULLBACK_ZONE (EMA20 < Price < EMA50)";
      }

      const latestBb = bbArr.length ? bbArr[bbArr.length - 1] : null;
      const bbUpper = latestBb ? latestBb.upper.toFixed(4) : 'N/A';
      const bbMiddle = latestBb ? latestBb.middle.toFixed(4) : 'N/A';
      const bbLower = latestBb ? latestBb.lower.toFixed(4) : 'N/A';
      
      let bbState = "Normal";
      let percentB = "N/A";
      let priceLocationState = "MID_RANGE";
      if (latestBb && latestBb.middle > 0) {
        const bandWidth = (latestBb.upper - latestBb.lower) / latestBb.middle;
        if (bandWidth < 0.001) bbState = "Squeezing (Low Volatility)";
        else if (bandWidth > 0.005) bbState = "Expanding (High Volatility)";

        if (latestBb.upper > latestBb.lower) {
          const pb = (currentPrice - latestBb.lower) / (latestBb.upper - latestBb.lower);
          percentB = pb.toFixed(2);
          if (pb > 0.9) priceLocationState = "NEAR_UPPER_BOLLINGER_BAND (Pushing Upper Band / High Resistance Zone)";
          else if (pb < 0.1) priceLocationState = "NEAR_LOWER_BOLLINGER_BAND (Pushing Lower Band / Floor Support Zone)";
          else if (pb >= 0.4 && pb <= 0.6) priceLocationState = "NEAR_MIDDLE_BOLLINGER_BAND (Equilibrium / Mean Reversion Center)";
        }
      }

      const chartTrend = (currentPrice != null && ema50 !== 'N/A') 
        ? (currentPrice > parseFloat(String(ema50)) ? "Bullish" : "Bearish") 
        : "Sideways";

      // 2. 4H Macro Structure & Trend
      let tf4hBias = "Neutral / Indecisive";
      let tf4hLatestClose = "N/A";
      let tf4hEma50Val = "N/A";
      let tf4hEma200Val = "N/A";
      let tf4hAtrVal = "N/A";

      if (tf4hRes.success && tf4hRes.values.length >= 20) {
        const chron4h = [...tf4hRes.values].reverse();
        const c4hCloses = chron4h.map((c: any) => parseFloat(c.close));
        const c4hHighs = chron4h.map((c: any) => parseFloat(c.high));
        const c4hLows = chron4h.map((c: any) => parseFloat(c.low));
        const e50_4h = EMA.calculate({ period: Math.min(50, c4hCloses.length), values: c4hCloses });
        const e200_4h = c4hCloses.length >= 200 ? EMA.calculate({ period: 200, values: c4hCloses }) : [];
        const atr_4h = ATR.calculate({ period: 14, high: c4hHighs, low: c4hLows, close: c4hCloses });

        tf4hLatestClose = c4hCloses[c4hCloses.length - 1].toFixed(4);
        tf4hEma50Val = e50_4h.length ? e50_4h[e50_4h.length - 1].toFixed(4) : "N/A";
        tf4hEma200Val = e200_4h.length ? e200_4h[e200_4h.length - 1].toFixed(4) : "N/A";
        tf4hAtrVal = atr_4h.length ? atr_4h[atr_4h.length - 1].toFixed(4) : "N/A";

        const last4hClose = c4hCloses[c4hCloses.length - 1];
        const last4hE50 = e50_4h.length ? e50_4h[e50_4h.length - 1] : null;
        const last4hE200 = e200_4h.length ? e200_4h[e200_4h.length - 1] : null;

        if (last4hE50 && last4hE200) {
          if (last4hClose > last4hE50 && last4hE50 > last4hE200) tf4hBias = "Strong Macro Bullish (Price > EMA50 > EMA200)";
          else if (last4hClose < last4hE50 && last4hE50 < last4hE200) tf4hBias = "Strong Macro Bearish (Price < EMA50 < EMA200)";
          else if (last4hClose > last4hE50) tf4hBias = "Macro Bullish (Price > EMA50)";
          else if (last4hClose < last4hE50) tf4hBias = "Macro Bearish (Price < EMA50)";
        } else if (last4hE50) {
          tf4hBias = last4hClose > last4hE50 ? "Macro Bullish" : "Macro Bearish";
        }
      }

      // 3. 1H Intermediate Structure & Momentum
      let tf1hBias = "Neutral / Range";
      let tf1hCurrentRsi = "N/A";
      let tf1hRsiDelta = "N/A";
      let tf1hMacdVal = "N/A";
      let tf1hMacdHist = "N/A";
      let tf1hEma20Val = "N/A";
      let tf1hEma50Val = "N/A";
      let tf1hEma200Val = "N/A";
      let tf1hLatestClose = "N/A";
      let tf1hAtrVal = "N/A";

      if (tf1hRes.success && tf1hRes.values.length >= 20) {
        const chron1h = [...tf1hRes.values].reverse();
        const c1hCloses = chron1h.map((c: any) => parseFloat(c.close));
        const c1hHighs = chron1h.map((c: any) => parseFloat(c.high));
        const c1hLows = chron1h.map((c: any) => parseFloat(c.low));
        const e20_1h = EMA.calculate({ period: 20, values: c1hCloses });
        const e50_1h = EMA.calculate({ period: Math.min(50, c1hCloses.length), values: c1hCloses });
        const rsi_1h = RSI.calculate({ period: 14, values: c1hCloses });
        const macd_1h = MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false, values: c1hCloses });
        const atr_1h = ATR.calculate({ period: 14, high: c1hHighs, low: c1hLows, close: c1hCloses });

        tf1hLatestClose = c1hCloses[c1hCloses.length - 1].toFixed(4);
        tf1hEma20Val = e20_1h.length ? e20_1h[e20_1h.length - 1].toFixed(4) : "N/A";
        tf1hEma50Val = e50_1h.length ? e50_1h[e50_1h.length - 1].toFixed(4) : "N/A";
        tf1hCurrentRsi = rsi_1h.length ? rsi_1h[rsi_1h.length - 1].toFixed(2) : "N/A";
        tf1hRsiDelta = rsi_1h.length >= 3 ? (rsi_1h[rsi_1h.length - 1] - rsi_1h[rsi_1h.length - 3]).toFixed(2) : "N/A";
        tf1hMacdVal = macd_1h.length ? Number(macd_1h[macd_1h.length - 1].MACD).toFixed(4) : "N/A";
        tf1hMacdHist = macd_1h.length ? Number(macd_1h[macd_1h.length - 1].histogram).toFixed(4) : "N/A";
        tf1hAtrVal = atr_1h.length ? atr_1h[atr_1h.length - 1].toFixed(4) : "N/A";

        const lastClose = c1hCloses[c1hCloses.length - 1];
        const lastE20 = e20_1h.length ? e20_1h[e20_1h.length - 1] : null;
        const lastE50 = e50_1h.length ? e50_1h[e50_1h.length - 1] : null;

        if (lastE20 && lastE50) {
          if (lastClose > lastE20 && lastE20 > lastE50) tf1hBias = "Bullish Momentum Expansion (Price > EMA20 > EMA50)";
          else if (lastClose < lastE20 && lastE20 < lastE50) tf1hBias = "Bearish Momentum Expansion (Price < EMA20 < EMA50)";
          else if (lastE20 > lastClose && lastClose > lastE50) tf1hBias = "Bullish Pullback Zone (EMA20 > Price > EMA50)";
          else if (lastE20 < lastClose && lastClose < lastE50) tf1hBias = "Bearish Pullback Zone (EMA20 < Price < EMA50)";
        } else if (lastE50) {
          tf1hBias = lastClose > lastE50 ? "Bullish Trend" : "Bearish Trend";
        }
      }

      // Assemble Comprehensive Multi-Timeframe Dataset
      const payloadObj = {
        data_source: "twelvedata_api_mode",
        asset: symbol,
        trade_duration: body.tradeDuration || "5m",
        execution_timeframe: executionTf,
        macro_timeframe_4h: {
          status: tf4hRes.success ? "VALID" : "UNAVAILABLE",
          latest_close: tf4hLatestClose,
          ema_50: tf4hEma50Val,
          ema_200: tf4hEma200Val,
          macro_bias: tf4hBias,
          atr: tf4hAtrVal
        },
        intermediate_timeframe_1h: {
          status: tf1hRes.success ? "VALID" : "UNAVAILABLE",
          latest_close: tf1hLatestClose,
          ema_20: tf1hEma20Val,
          ema_50: tf1hEma50Val,
          ema_200: tf1hEma200Val,
          rsi_value: tf1hCurrentRsi,
          rsi_delta_3c: tf1hRsiDelta,
          macd_line: tf1hMacdVal,
          macd_histogram: tf1hMacdHist,
          intermediate_bias: tf1hBias,
          atr: tf1hAtrVal
        },
        execution_timeframe_5m: {
          current_price: currentPrice,
          chart_trend: chartTrend,
          moving_average_alignment: {
            ema_20: ema20,
            ema_50: ema50,
            ema_200: ema200,
            alignment_status: maAlignment
          },
          execution_indicators: {
            rsi_value: currentRsi,
            rsi_3_candle_delta: rsiChange,
            macd_line: macdVal,
            macd_signal: macdSignalVal,
            macd_histogram: macdHistVal,
            macd_histogram_slope: macdSlope,
            atr: atr5m
          },
          market_structure_and_location: {
            bollinger_bands: {
              upper_band: bbUpper,
              middle_band: bbMiddle,
              lower_band: bbLower,
              bollinger_state: bbState,
              bollinger_percent_b: percentB,
              price_location_state: priceLocationState
            },
            nearest_resistance_r1: r1 || 'N/A',
            pips_under_resistance: pipsUnderResistance,
            nearest_support_s1: s1 || 'N/A',
            pips_above_support: pipsAboveSupport
          },
          recent_5_candles_anatomy: fiveCandles
        }
      };

      extractedTextData = JSON.stringify(payloadObj, null, 2);
      rawImage = ""; // Zero image dependency in TwelveData API mode
    }

    if (!rawImage && !extractedTextData) return NextResponse.json({ error: "A chart screenshot or text data is required.", code: "MOBILE_IMAGE_MISSING", analysisType: "mobile_visual" }, { status: 400 });
    if (!body?.symbol || !body?.timeframe || !body?.tradeDuration) return NextResponse.json({ error: "symbol, timeframe and tradeDuration are required.", code: "MOBILE_SETTINGS_MISSING", analysisType: "mobile_visual" }, { status: 400 });

    const provider = typeof body.provider === "string" ? body.provider : "gemini";
    const model = typeof body.model === "string" && body.model.trim() ? body.model : undefined;
    const capabilities = getModelCapabilities(provider, model || "");
    if (!capabilities) return NextResponse.json({ error: `Unknown AI provider/model: ${provider}/${model || "default"}`, code: "MOBILE_MODEL_UNKNOWN", analysisType: "mobile_visual" }, { status: 400 });
    
    // Only require vision if we are actually using an image (visual mode)
    if (!capabilities.vision && body.dataSource !== "twelvedata") {
      return NextResponse.json({ error: `Selected AI model (${model || "default"}) does not support image analysis.`, code: "MOBILE_MODEL_NO_VISION", analysisType: "mobile_visual" }, { status: 400 });
    }

    const image = getMimeAndBase64(rawImage);
    const baseRequest = UniversalAIRequestSchema.parse({
      mode: "visual_only", provider, model, platform: String(body.platform || "Unknown"), symbol: String(body.symbol), primaryTimeframe: String(body.timeframe), tradeDuration: String(body.tradeDuration),
      selectedStrategies: Array.isArray(body.selectedStrategies) ? body.selectedStrategies : ["Auto (AI Selection)"],
      visibleIndicators: Array.isArray(body.visibleIndicators) ? body.visibleIndicators : [], screenshot: image.base64 ? image : undefined, promptOverride: "", rawOutput: false, isProgressive: false,
    });

    let finalPrompt = "";
    if (body.dataSource === "twelvedata") {
      // EXACT 26-SECTION PRODUCTION API MODE PROMPT
      finalPrompt = `You are the API MARKET DECISION ENGINE for a 5-minute trading assistant.

================================================================================
SECTION 1: ROLE DEFINITION
================================================================================
You are the institutional, deterministic decision layer for automated 5-minute trade execution.
Your objective: Take verified numerical market data across 4H Macro, 1H Intermediate, and 5M Execution timeframes, synthesize multi-timeframe confluence, and produce a high-confidence, actionable BUY, SELL, or WAIT signal with exact numerical reasoning.

================================================================================
SECTION 2: MODE SEPARATION (API MODE vs VISION MODE)
================================================================================
IMPORTANT: This is API mode, NOT Vision mode.
- You receive structured numerical market data calculated directly from TwelveData live market APIs.
- The API data is the absolute primary source of truth.
- DO NOT analyze screenshots.
- DO NOT infer values from imaginary charts.
- DO NOT invent missing prices, candles, indicators, support/resistance, or market structure.
- Treat math, moving averages, wick percentages, and indicator values as hard deterministic facts.

================================================================================
SECTION 3: ANALYSIS PIPELINE (4H -> 1H -> 5M)
================================================================================
Execute this analysis pipeline sequentially:
Stage 1: DATA VALIDATION & QUALITY AUDIT
Stage 2: 4H MACRO REGIME & HIGHER-TIMEFRAME BIAS
Stage 3: 1H INTERMEDIATE STRUCTURE & MOMENTUM CONFIRMATION
Stage 4: 5M EXECUTION MOVING AVERAGE ALIGNMENT
Stage 5: 5M PRICE LOCATION & BOLLINGER BEHAVIOR
Stage 6: 5M MOMENTUM & INDICATOR DIVERGENCE / SLOPES
Stage 7: 5-CANDLE PRICE ACTION ANATOMY & REJECTIONS
Stage 8: SUPPORT & RESISTANCE PROXIMITY AUDIT (CEILING/FLOOR TRAPS)
Stage 9: BULLISH vs BEARISH COMPETITION SEPARATION
Stage 10: ENTRY + CONFIDENCE + SIZING + FINAL DETERMINATION

================================================================================
SECTION 4: DATA VALIDATION & QUALITY SCORE
================================================================================
Verify that current price, moving averages, RSI, MACD, Bollinger Bands, and support/resistance are present in the provided dataset. Assign a dataQuality score (0 to 100). If essential execution metrics are present, dataQuality should be >= 90.

================================================================================
SECTION 5: 4H MACRO MARKET EVALUATION
================================================================================
Evaluate 4H macro trend using 4H Price vs EMA50 and EMA200:
- Bullish: 4H Price > 4H EMA50
- Bearish: 4H Price < 4H EMA50
- 4H establishes the macro directional tailwind. Never take aggressive counter-macro trades without severe 5M exhaustion confirmation.

================================================================================
SECTION 6: 1H INTERMEDIATE MARKET EVALUATION
================================================================================
Evaluate 1H intermediate trend and momentum:
- Bullish Alignment: 1H Price > EMA20 > EMA50 with 1H RSI > 50 and rising MACD.
- Bearish Alignment: 1H Price < EMA20 < EMA50 with 1H RSI < 50 and falling MACD.
- Intermediate Pullback: Price retracing toward 1H EMA20/EMA50 while higher trend remains intact.

================================================================================
SECTION 7: 5M EXECUTION MARKET EVALUATION
================================================================================
5M is the execution timeframe where entries, trigger candles, wicks, and invalidations occur.
- Bullish Execution: Price breaking out or bouncing off EMA20 with expanding body and rising momentum.
- Bearish Execution: Price breaking down or rejecting EMA20 with expanding body and falling momentum.

================================================================================
SECTION 8: MOVING AVERAGE ALIGNMENT RULES
================================================================================
- FULL_BULLISH_STACK: Price > EMA20 > EMA50 > EMA200 -> Strong institutional long pressure (+30 Bullish).
- FULL_BEARISH_STACK: Price < EMA20 < EMA50 < EMA200 -> Strong institutional short pressure (+30 Bearish).
- BULLISH_PULLBACK_ZONE: EMA20 > Price > EMA50 -> Healthy retracement looking for support bounce.
- BEARISH_PULLBACK_ZONE: EMA20 < Price < EMA50 -> Healthy retracement looking for resistance rejection.
- ENTANGLED_CHOP: EMA20 and EMA50 crisscrossing with Price oscillating tightly -> Standby / WAIT bias.

================================================================================
SECTION 9: PRICE LOCATION & BOLLINGER RULES
================================================================================
- In a strong trending market (4H/1H aligned), price expanding and walking the outer Bollinger Band is MOMENTUM CONFIRMATION, not an automatic reversal signal.
- In a ranging market, %B > 0.95 near Upper Band without breakout momentum represents high resistance risk.
- In a ranging market, %B < 0.05 near Lower Band without breakdown momentum represents floor support risk.
- Bollinger Squeeze (<0.001 bandwidth) warns of impending volatility explosion; wait for directional expansion.

================================================================================
SECTION 10: MOMENTUM & INDICATOR ALIGNMENT RULES
================================================================================
- RSI Expansion: RSI rising with 3-candle positive delta confirms buyer aggression. RSI falling with negative delta confirms seller aggression.
- RSI Extreme Divergence: RSI > 75 stalling near resistance or RSI < 25 stalling near support warns of exhaustion.
- MACD Slope: Rising histogram / Bullish cross confirms upward velocity. Falling histogram / Bearish cross confirms downward velocity.

================================================================================
SECTION 11: 5-CANDLE PRICE ACTION ANATOMY
================================================================================
Examine recent 5 candles:
- BULLISH_HAMMER_REJECTION: Lower wick >= 50% of range with small upper body -> Buyers defending level.
- BEARISH_SHOOTING_STAR_REJECTION: Upper wick >= 50% of range with small lower body -> Sellers defending level.
- BULLISH_EXPANSION: Solid green body >= 65% of range closing near highs -> Strong continuation.
- BEARISH_EXPANSION: Solid red body >= 65% of range closing near lows -> Strong continuation.
- DOJI_INDECISION: Body <= 20% of range -> Indecision; requires next candle confirmation.

================================================================================
SECTION 12: SUPPORT & RESISTANCE RISK RULES
================================================================================
- Proximity to Resistance (R1): If buying, price must have room to run (>3.0 pips to R1). Buying directly into a ceiling with stalling RSI delta is a hard disqualify.
- Proximity to Support (S1): If selling, price must have room to run (>3.0 pips to S1). Selling directly into a floor with stalling RSI delta is a hard disqualify.

================================================================================
SECTION 13: SETUP DETECTION & CLASSIFICATION
================================================================================
Classify setup into one of:
1. TREND_CONTINUATION: Multi-timeframe trend alignment with momentum expansion.
2. PULLBACK_REJECTION: Healthy retracement to dynamic EMA20/EMA50 with rejection wick in trend direction.
3. BREAKOUT: Structural break above resistance or below support with expanding volume/body.
4. MEAN_REVERSION: Reversal from extreme exhaustion band back toward equilibrium (only with clear rejection candle).
5. SIDEWAYS_CHOP: Entangled EMAs and flat indicators (WAIT signal).

================================================================================
SECTION 14: BULLISH vs BEARISH SEPARATION (COMPETITION ENGINE)
================================================================================
Separately calculate:
- whyBuy: Concrete institutional reasons favoring a long position.
- whyNotBuy: Risks, overhead resistance, or negative divergence threatening a long.
- whySell: Concrete institutional reasons favoring a short position.
- whyNotSell: Risks, floor support, or positive divergence threatening a short.
Compute bullishScore (0-100) and bearishScore (0-100).

================================================================================
SECTION 15: DISQUALIFICATION / HARD-BLOCK CONDITIONS (NO-TRADE TRAPS)
================================================================================
Force signal to WAIT if:
- Trapped directly under R1 (<2.5 pips) with negative RSI delta.
- Trapped directly on S1 (<2.5 pips) with positive RSI delta.
- Dead volatility squeeze with RSI between 48-52 and flat MACD slope.
- 5M trend directly contradicts 4H macro trend with no structural rejection pattern.

================================================================================
SECTION 16: SIGNAL DIRECTION DETERMINATION (BUY / SELL / WAIT)
================================================================================
- Issue **BUY** when bullishScore >= 75 and bullishScore > bearishScore + 20 and no hard-blocks trigger.
- Issue **SELL** when bearishScore >= 75 and bearishScore > bullishScore + 20 and no hard-blocks trigger.
- Issue **WAIT** when market is entangled, scores are balanced, or hard-block trap conditions are active.

================================================================================
SECTION 17: MULTI-TIMEFRAME ALIGNMENT GATE
================================================================================
Verify 4H Macro + 1H Intermediate + 5M Execution alignment:
- Full 3-timeframe confluence = Grade A Institutional Setup (Confidence 88% - 95%).
- 2-timeframe confluence (1H + 5M aligned with neutral 4H) = Grade B Setup (Confidence 80% - 87%).
- Divergent / Conflicted timeframes = Standby / WAIT (Confidence 20% - 45%).

================================================================================
SECTION 18: CONFIDENCE SCORING SYSTEM
================================================================================
- 85% - 95%: Flawless multi-timeframe confluence, clean momentum expansion, clear path to TP with safe SL distance.
- 78% - 84%: Strong directional setup with minor minor friction (e.g. 1 intermediate candle pause).
- 50% - 75%: Mixed signals or approaching major structural pivot.
- 20% - 45%: Indecisive chop, squeeze, or active trap conditions.

================================================================================
SECTION 19: TRADE READINESS CLASSIFICATION
================================================================================
- "READY": Confidence >= 80% with immediate trigger candle confirmed.
- "GOOD": Confidence 75% - 79% with setup valid but awaiting ideal entry tick.
- "FAIR": Confidence 60% - 74% with partial setup development.
- "NOT READY": Confidence < 60% (WAIT).

================================================================================
SECTION 20: DYNAMIC ENTRY, STOP LOSS & TAKE PROFIT CALCULATION
================================================================================
Calculate dynamic numerical price levels:
- entryPrice: Current market close.
- BUY Stop Loss: 2.0 pips below 5M S1 or recent swing low.
- BUY Take Profit: 1.0 pip below 5M R1 or 1.5x ATR target.
- SELL Stop Loss: 2.0 pips above 5M R1 or recent swing high.
- SELL Take Profit: 1.0 pip above 5M S1 or 1.5x ATR target.

================================================================================
SECTION 21: TRADE DURATION & EXPIRATION ALIGNMENT
================================================================================
The trade is targeted for 5-minute binary expiry / fast execution. Momentum must be active NOW.

================================================================================
SECTION 22: RISK / REWARD AND PROXIMITY FILTERING
================================================================================
Ensure target potential exceeds risk distance. Avoid entering trades where stop distance is larger than distance to nearest barrier.

================================================================================
SECTION 23: ANTI-HALLUCINATION & MATH VERIFICATION RULES
================================================================================
- Quote exact values from the provided JSON dataset.
- Do not invent candle prices or indicators not present in the payload.

================================================================================
SECTION 24: DECISION PRIORITY HIERARCHY
================================================================================
Priority 1: Multi-Timeframe Confluence (4H -> 1H -> 5M)
Priority 2: 5M Execution Momentum & Candle Anatomy
Priority 3: S/R Barrier Distance & Clearance
Priority 4: Indicator Crosses & Delta Slopes

================================================================================
SECTION 25: STRICT JSON OUTPUT SCHEMA
================================================================================
You MUST output strictly pure JSON matching this exact schema:
{
  "trend": "Bullish" | "Bearish" | "Sideways",
  "signal": "BUY" | "SELL" | "WAIT",
  "confidence": number,
  "readiness": "READY" | "GOOD" | "FAIR" | "NOT READY",
  "marketRegime": string,
  "marketState": string,
  "setup": "TREND_CONTINUATION" | "PULLBACK_REJECTION" | "BREAKOUT" | "MEAN_REVERSION" | "SIDEWAYS_CHOP",
  "timeframeAnalysis": {
    "macro_4h": string,
    "intermediate_1h": string,
    "execution_5m": string,
    "confluenceGrade": "GRADE_A_CONFLUENT" | "GRADE_B_ALIGNED" | "GRADE_C_CONFLICTED"
  },
  "dataQuality": number,
  "bullishScore": number,
  "bearishScore": number,
  "whyBuy": string[],
  "whyNotBuy": string[],
  "whySell": string[],
  "whyNotSell": string[],
  "scores": {
    "bullish": number,
    "bearish": number,
    "wait": number
  },
  "entryPrice": number | null,
  "takeProfit": number | null,
  "stopLoss": number | null,
  "reasoning": string,
  "explanation": string
}

================================================================================
SECTION 26: FINAL OUTPUT DIRECTIVES
================================================================================
- Return ONLY valid parseable JSON.
- No markdown wrappers (\`\`\`json), no preamble, no trailing commentary.

LIVE MULTI-TIMEFRAME DATASET:
${extractedTextData}
`;
    } else if (rawImage) {
      // PRIMARY VISUAL MODE (CHART SCREENSHOTS)
      finalPrompt = `You are an elite, decisive institutional trading engine.
Your objective: Identify high-probability 1-minute to 5-minute trade setups directly from the provided chart screenshot and produce clear, actionable **BUY** or **SELL** signals with high confidence (80% - 95%).

DECISION CRITERIA & EXECUTION RULES:
1. TREND & MOMENTUM EXPANSION:
   - Strong Downtrend (Lower Highs, Lower Lows, Red Candle Expansion, MACD Bearish / Falling, RSI < 45):
     -> Issue **SELL** with **80% - 92% confidence**.
     -> NOTE: Price riding or pushing down on the Lower Bollinger Band in a downtrend is strong BEARISH MOMENTUM confirmation, NOT a block.
   - Strong Uptrend (Higher Highs, Higher Lows, Green Candle Expansion, MACD Bullish / Rising, RSI > 55):
     -> Issue **BUY** with **80% - 92% confidence**.
     -> NOTE: Price riding or pushing up on the Upper Bollinger Band in an uptrend is strong BULLISH MOMENTUM confirmation, NOT a block.

2. PULLBACK & REVERSAL REJECTIONS:
   - Pullback to Middle Band / 20 EMA in an uptrend with a green bounce or lower wick:
     -> Issue **BUY** (80% - 90%).
   - Pullback to Middle Band / 20 EMA in a downtrend with a red bounce or upper wick:
     -> Issue **SELL** (80% - 90%).

3. WHEN TO OUTPUT WAIT:
   - Only output **WAIT** (Confidence 20% - 45%) if the market is completely flat (Dojis, zero volume), in a tight sideways squeeze with no direction, or if RSI is dead flat at 50 with conflicting indicators.

4. CONFIDENCE SCORING:
   - When trend, recent candles, and momentum agree in the same direction: Award **82% to 94% confidence** so the trader can execute.

The user has provided a chart screenshot of ${body.symbol} on the ${body.timeframe} timeframe (${body.tradeDuration} trade duration).
Visible indicators on chart: ${(baseRequest.visibleIndicators || []).join(", ") || "Candlestick price action, RSI, MACD, Bollinger Bands, Moving Averages"}.

ANALYSIS INSTRUCTIONS:
1. Extract current price, recent candle sequence (trend direction, momentum, wicks/bodies), support/resistance, RSI, MACD, and Bollinger Bands directly from the chart image.
2. If momentum is clearly pointing DOWN (bearish candles, falling RSI/MACD), decisively issue **SELL** (82%-92% confidence).
3. If momentum is clearly pointing UP (bullish candles, rising RSI/MACD), decisively issue **BUY** (82%-92% confidence).
4. Only output WAIT if the market is completely flat or dead sideways.

Format your answer strictly as a pure JSON object:
{
  "trend": "Bullish" | "Bearish" | "Sideways",
  "signal": "BUY" | "SELL" | "WAIT",
  "marketState": "Regime description (e.g. Bearish Momentum Expansion, Bullish Trend Pullback, Sideways Chop)",
  "entryPrice": number | null,
  "takeProfit": number | null,
  "stopLoss": number | null,
  "confidence": number,
  "readiness": "READY" | "GOOD" | "FAIR" | "NOT READY",
  "setup": "TREND_CONTINUATION" | "PULLBACK_REJECTION" | "BREAKOUT" | "SIDEWAYS_CHOP",
  "scores": {
    "bullish": number,
    "bearish": number,
    "wait": number
  },
  "reasoning": "2-sentence decisive institutional rationale explaining why this trade was chosen.",
  "explanation": "1-sentence executive summary"
}
`;
    } else {
      finalPrompt = `The user is trading ${body.symbol} on the ${body.timeframe} timeframe with ${body.tradeDuration} duration.
Live data:
${extractedTextData || "Rely on standard market structure."}

Format your answer strictly as a pure JSON object with trend, signal (BUY/SELL/WAIT), confidence, marketState, entryPrice, stopLoss, takeProfit, reasoning, and explanation.
`;
    }

    const finalAnalysis = await callProvider({ ...baseRequest, promptOverride: finalPrompt, rawOutput: false, isProgressive: false });
    
    let calibratedSignal = finalAnalysis.signal || "WAIT";
    let calibratedConfidence = finalAnalysis.confidence || 0;
    
    // Ensure confident signals are maintained
    if ((calibratedSignal === "BUY" || calibratedSignal === "SELL") && calibratedConfidence >= 70) {
      calibratedConfidence = Math.max(80, calibratedConfidence);
    }

    // Ensure all required fields exist and pass through
    const finalData = {
      trend: finalAnalysis.trend || "Sideways",
      signal: calibratedSignal,
      marketState: finalAnalysis.marketState || finalAnalysis.marketRegime || "Unknown",
      marketRegime: finalAnalysis.marketRegime || finalAnalysis.marketState || "Unknown",
      entryPrice: finalAnalysis.entryPrice || finalAnalysis.entry || null,
      takeProfit: finalAnalysis.takeProfit || null,
      stopLoss: finalAnalysis.stopLoss || null,
      confidence: calibratedConfidence,
      readiness: finalAnalysis.readiness || (calibratedConfidence >= 78 ? "READY" : calibratedConfidence >= 60 ? "FAIR" : "NOT READY"),
      setup: finalAnalysis.setup || "NO_CLEAR_SETUP",
      timeframeAnalysis: finalAnalysis.timeframeAnalysis || undefined,
      dataQuality: finalAnalysis.dataQuality || (body.dataSource === "twelvedata" ? 95 : 85),
      bullishScore: finalAnalysis.bullishScore || finalAnalysis.scores?.bullish || (calibratedSignal === "BUY" ? calibratedConfidence : 20),
      bearishScore: finalAnalysis.bearishScore || finalAnalysis.scores?.bearish || (calibratedSignal === "SELL" ? calibratedConfidence : 20),
      whyBuy: Array.isArray(finalAnalysis.whyBuy) ? finalAnalysis.whyBuy : [],
      whyNotBuy: Array.isArray(finalAnalysis.whyNotBuy) ? finalAnalysis.whyNotBuy : [],
      whySell: Array.isArray(finalAnalysis.whySell) ? finalAnalysis.whySell : [],
      whyNotSell: Array.isArray(finalAnalysis.whyNotSell) ? finalAnalysis.whyNotSell : [],
      scores: finalAnalysis.scores || {
        bullish: finalAnalysis.bullishScore || (calibratedSignal === "BUY" ? calibratedConfidence : 20),
        bearish: finalAnalysis.bearishScore || (calibratedSignal === "SELL" ? calibratedConfidence : 20),
        wait: calibratedSignal === "WAIT" ? 80 : 20
      },
      reasoning: finalAnalysis.reasoning || "No reasoning provided",
      explanation: finalAnalysis.explanation || "No explanation provided",
      unifiedMarketData: {
        currentPrice: { value: finalAnalysis.entryPrice || finalAnalysis.entry || 0, confidence: 90 },
      }
    };

    const validated = UniversalAIResponseSchema.parse(finalData);

    return NextResponse.json({
      ...validated,
      analysisType: body.dataSource === "twelvedata" ? "mobile_api" : "mobile_visual",
      extractionOnly: false,
      source: body.dataSource === "twelvedata" ? "twelvedata_multi_timeframe_api" : "mobile_single_prompt",
      timings: { totalMs: performance.now() - started },
    });
  } catch (error: any) {
    console.error("[Mobile Analysis API Error]", error);
    return NextResponse.json({ error: error?.message || "Mobile chart analysis failed", code: "MOBILE_ANALYSIS_FAILED", analysisType: "mobile_visual" }, { status: 500 });
  }
}

