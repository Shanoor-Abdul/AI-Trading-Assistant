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

      const symbol = body.symbol ? body.symbol.replace(/\s*\(OTC\)/i, '') : "EUR/USD";
      
      const intervalMap: any = {
        "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day"
      };
      const interval = intervalMap[body.timeframe || "5m"] || "5min";
      const macroInterval = (body.timeframe === "15m") ? "4h" : "1h";

      const baseUrl = `https://api.twelvedata.com`;
      const baseParams = `symbol=${symbol}&interval=${interval}&apikey=${apiKey}`;
      
      const endpoints = [
        fetch(`${baseUrl}/time_series?${baseParams}&outputsize=20`).then(r => r.json()),
        fetch(`${baseUrl}/rsi?${baseParams}&time_period=14&outputsize=3`).then(r => r.json()),
        fetch(`${baseUrl}/macd?${baseParams}&outputsize=3`).then(r => r.json()),
        fetch(`${baseUrl}/ema?${baseParams}&time_period=20&outputsize=1`).then(r => r.json()),
        fetch(`${baseUrl}/ema?${baseParams}&time_period=50&outputsize=1`).then(r => r.json()),
        fetch(`${baseUrl}/bbands?${baseParams}&time_period=20&sd=2&outputsize=1`).then(r => r.json()),
        fetch(`${baseUrl}/atr?${baseParams}&time_period=14&outputsize=1`).then(r => r.json())
      ];
      
      const [priceRes, rsiRes, macdRes, ema20Res, ema50Res, bbRes, atrRes] = await Promise.all(endpoints);
      
      if (priceRes.status === "error") throw new Error(priceRes.message);
      if (rsiRes.status === "error") throw new Error(rsiRes.message);
      
      const getHistory = (arr: any[], key: string, limit = 5) => {
          if (!arr || !arr.length) return [];
          // TwelveData returns newest first. We take limit, reverse to show Oldest -> Prev -> Newest
          return arr.slice(0, limit).map((v: any) => parseFloat(v[key])).reverse();
      };

      const closeHistory = getHistory(priceRes.values, 'close', 5);
      const currentPrice = closeHistory[closeHistory.length - 1] || 'N/A';
      
      // 5-Candle Anatomy & Pattern Feature Engineering
      const rawCandles = priceRes.values?.slice(0, 5) || [];
      const fiveCandles = [...rawCandles].reverse().map((c: any, idx: number) => {
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

      // Support & Resistance via Local High/Low (Boss's fallback)
      const r1 = priceRes.values?.length ? Math.max(...priceRes.values.map((v: any) => parseFloat(v.high))) : null;
      const s1 = priceRes.values?.length ? Math.min(...priceRes.values.map((v: any) => parseFloat(v.low))) : null;
      
      const pipMultiplier = (symbol.includes("JPY") || symbol.includes("XAU") || symbol.includes("XAG")) ? 100 : 10000;
      
      const pipsUnderResistance = (r1 && currentPrice !== 'N/A') ? ((r1 - (currentPrice as number)) * pipMultiplier).toFixed(1) : 'N/A';
      const pipsAboveSupport = (s1 && currentPrice !== 'N/A') ? (((currentPrice as number) - s1) * pipMultiplier).toFixed(1) : 'N/A';

      // Momentum Deltas & Slopes (Feature Engineering)
      const rsiArr = getHistory(rsiRes.values, 'rsi', 3);
      const rsiChange = rsiArr.length === 3 ? (rsiArr[2] - rsiArr[0]).toFixed(2) : 'N/A';
      const currentRsi = rsiArr[rsiArr.length - 1]?.toFixed(2) || 'N/A';

      const macdHistArr = getHistory(macdRes.values, 'macd_hist', 3);
      const macdHistChange = macdHistArr.length === 3 ? (macdHistArr[2] - macdHistArr[0]).toFixed(4) : 'N/A';
      let macdSlope = "Flat";
      if (macdHistArr.length === 3) {
         if (macdHistArr[2] > macdHistArr[1] && macdHistArr[1] > macdHistArr[0]) macdSlope = "Rising";
         else if (macdHistArr[2] < macdHistArr[1] && macdHistArr[1] < macdHistArr[0]) macdSlope = "Falling";
         else if (macdHistArr[2] > 0 && macdHistArr[1] < 0) macdSlope = "Bullish Cross";
         else if (macdHistArr[2] < 0 && macdHistArr[1] > 0) macdSlope = "Bearish Cross";
      }

      const macd = macdRes.values?.[0]?.macd ? parseFloat(macdRes.values[0].macd).toFixed(4) : 'N/A';
      const macdSignal = macdRes.values?.[0]?.macd_signal ? parseFloat(macdRes.values[0].macd_signal).toFixed(4) : 'N/A';
      const ema20 = ema20Res.values?.[0]?.ema ? parseFloat(ema20Res.values[0].ema).toFixed(4) : 'N/A';
      const ema50 = ema50Res.values?.[0]?.ema ? parseFloat(ema50Res.values[0].ema).toFixed(4) : 'N/A';
      
      let maAlignment = "ENTANGLED_CHOP";
      if (currentPrice !== 'N/A' && ema20 !== 'N/A' && ema50 !== 'N/A') {
        const cp = Number(currentPrice);
        const e20 = Number(ema20);
        const e50 = Number(ema50);
        if (cp > e20 && e20 > e50) maAlignment = "FULL_BULLISH_STACK (Price > EMA20 > EMA50)";
        else if (cp < e20 && e20 < e50) maAlignment = "FULL_BEARISH_STACK (Price < EMA20 < EMA50)";
        else if (e20 > cp && cp > e50) maAlignment = "BULLISH_PULLBACK_ZONE (EMA20 > Price > EMA50)";
        else if (e20 < cp && cp < e50) maAlignment = "BEARISH_PULLBACK_ZONE (EMA20 < Price < EMA50)";
      }

      const bbUpper = bbRes.values?.[0]?.upper_band ? parseFloat(bbRes.values[0].upper_band).toFixed(4) : 'N/A';
      const bbMiddle = bbRes.values?.[0]?.middle_band ? parseFloat(bbRes.values[0].middle_band).toFixed(4) : 'N/A';
      const bbLower = bbRes.values?.[0]?.lower_band ? parseFloat(bbRes.values[0].lower_band).toFixed(4) : 'N/A';
      
      let bbState = "Normal";
      let percentB = "N/A";
      let priceLocationState = "MID_RANGE";
      if (bbUpper !== 'N/A' && bbLower !== 'N/A' && bbMiddle !== 'N/A') {
         const bandWidth = (parseFloat(bbUpper) - parseFloat(bbLower)) / parseFloat(bbMiddle);
         if (bandWidth < 0.001) bbState = "Squeezing (Low Volatility)";
         else if (bandWidth > 0.005) bbState = "Expanding (High Volatility)";

         if (currentPrice !== 'N/A') {
           const cp = Number(currentPrice);
           const bbu = Number(bbUpper);
           const bbl = Number(bbLower);
           if (bbu > bbl) {
             const pb = (cp - bbl) / (bbu - bbl);
             percentB = pb.toFixed(2);
             if (pb > 0.9) priceLocationState = "NEAR_UPPER_BOLLINGER_BAND (Overextended / High Resistance Risk)";
             else if (pb < 0.1) priceLocationState = "NEAR_LOWER_BOLLINGER_BAND (Oversold / Floor Support Risk)";
             else if (pb >= 0.4 && pb <= 0.6) priceLocationState = "NEAR_MIDDLE_BOLLINGER_BAND (Equilibrium / Mean Reversion Center)";
           }
         }
      }

      const atr = atrRes.values?.[0]?.atr ? parseFloat(atrRes.values[0].atr).toFixed(4) : 'N/A';
      
      const timeframeTrend = (currentPrice !== 'N/A' && ema50 !== 'N/A') 
        ? (parseFloat(String(currentPrice)) > parseFloat(String(ema50)) ? "Bullish" : "Bearish") 
        : "Sideways";

      const payloadObj = {
          asset: symbol,
          timeframe: body.timeframe || "5m",
          timeframe_trend: timeframeTrend,
          current_price: currentPrice,
          moving_average_alignment: {
              ema_20: ema20,
              ema_50: ema50,
              alignment_status: maAlignment
          },
          execution_indicators: {
              rsi_value: currentRsi,
              rsi_3_candle_delta: rsiChange,
              macd_histogram: macd,
              macd_histogram_slope: macdSlope
          },
          market_structure_and_location: {
              bollinger_state: bbState,
              bollinger_percent_b: percentB,
              price_location_state: priceLocationState,
              nearest_resistance_r1: r1 || 'N/A',
              pips_under_resistance: pipsUnderResistance,
              nearest_support_s1: s1 || 'N/A',
              pips_above_support: pipsAboveSupport
          },
          recent_5_candles_anatomy: fiveCandles
      };

      extractedTextData = JSON.stringify(payloadObj, null, 2);
      rawImage = ""; // In twelvedata mode, rely directly on structured math

      // =========================================================================
      // ZERO-TOKEN GATEKEEPER FILTER (ACTIVE TIMEFRAME TRAP DETECTION)
      // Zero AI Tokens spent on flat, trapped, or clearly invalid market conditions
      // =========================================================================
      const numRsi = parseFloat(String(currentRsi));
      const numRsiDelta = parseFloat(String(rsiChange));
      const numPipsToR1 = parseFloat(String(pipsUnderResistance));
      const numPipsToS1 = parseFloat(String(pipsAboveSupport));

      let localFilterTriggered = false;
      let filterReason = "";
      let marketStateTitle = "";
      let recheckTime = "3-5 minutes";

      // Gate 1: Trap under Resistance (Bullish trend but hitting ceiling with falling momentum)
      if (timeframeTrend === "Bullish" && !isNaN(numPipsToR1) && numPipsToR1 < 3.0 && !isNaN(numRsiDelta) && numRsiDelta <= 0) {
        localFilterTriggered = true;
        marketStateTitle = "Resistance Ceiling Trap";
        filterReason = `Price is sitting just ${numPipsToR1} pips below R1 Resistance with negative RSI momentum (${numRsiDelta}). High risk of a false breakout rejection.`;
        recheckTime = "Wait 3-5 minutes for a clean structural break above R1.";
      }
      // Gate 2: Trap on Support (Bearish trend but hitting floor with stalling downward momentum)
      else if (timeframeTrend === "Bearish" && !isNaN(numPipsToS1) && numPipsToS1 < 3.0 && !isNaN(numRsiDelta) && numRsiDelta >= 0) {
        localFilterTriggered = true;
        marketStateTitle = "Support Floor Trap";
        filterReason = `Price is sitting directly on S1 Support (${numPipsToS1} pips away) with stalling downward momentum (${numRsiDelta} delta). High risk of bounce.`;
        recheckTime = "Wait 3-5 minutes for a clean structural breakdown below S1.";
      }
      // Gate 3: Extreme Volatility Squeeze (Flat / Dead market)
      else if (bbState.includes("Squeezing") && !isNaN(numRsiDelta) && Math.abs(numRsiDelta) < 0.8) {
        localFilterTriggered = true;
        marketStateTitle = "Volatility Squeeze (Dead Market)";
        filterReason = `Market is in an extreme Bollinger Squeeze with flat momentum (${numRsiDelta} delta). Energy is consolidating sideways.`;
        recheckTime = "Standby 5-10 minutes for a volatility breakout.";
      }
      // Gate 4: Neutral Dead Zone / Choppy Indecision
      else if (!isNaN(numRsi) && numRsi >= 48 && numRsi <= 52 && macdSlope === "Flat") {
        localFilterTriggered = true;
        marketStateTitle = "Neutral Dead Zone (Chop / Consolidation)";
        filterReason = `Market is in an indecisive range (RSI: ${currentRsi}, MACD: Flat). No directional conviction present.`;
        recheckTime = "Standby 3-5 minutes for directional momentum to form.";
      }

      if (localFilterTriggered) {
        const dashboardTelemetry = `🛑 [Zero-Token Gatekeeper Filter]\n` +
          `• State: ${marketStateTitle}\n` +
          `• Reason: ${filterReason}\n` +
          `• Telemetry: Trend: ${timeframeTrend} | RSI: ${currentRsi} (Δ ${rsiChange}) | MACD: ${macdSlope} | R1: ${pipsUnderResistance}p | S1: ${pipsAboveSupport}p\n` +
          `• Next Check: ${recheckTime} (0 AI Tokens Used)`;

        return NextResponse.json({
          trend: timeframeTrend,
          signal: "WAIT",
          confidence: 20,
          readiness: "NOT READY",
          estimatedConfidence: "LOW",
          recommendedTimeframe: body.timeframe || "5m",
          entryPrice: typeof currentPrice === "number" ? currentPrice : null,
          stopLoss: null,
          takeProfit: null,
          explanation: `[Gatekeeper - 0 Tokens Used] ${marketStateTitle}: ${filterReason}`,
          reasoning: dashboardTelemetry,
          marketState: marketStateTitle,
          analysisType: "mobile_visual",
          timings: { totalMs: 0 }
        });
      }
    }

    // DEBUG: Save image to local disk
    if (rawImage) {
      try {
        const debugDir = path.join(process.cwd(), 'debugimages');
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
        const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, "");
        const filename = `debug_${Date.now()}.png`;
        fs.writeFileSync(path.join(debugDir, filename), Buffer.from(base64Data, 'base64'));
      } catch (e) {}
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

    const INSTITUTIONAL_10_STAGE_SYSTEM_PROMPT = `
You are the world's most disciplined institutional algorithmic trading decision engine.
Your single mission: Maximize win rate (target >= 80%) on ${body.timeframe} executions (${body.tradeDuration} duration) by rejecting all low-probability, choppy, or ambiguous setups.

Execute this MANDATORY 10-STAGE DECISION PIPELINE in strict order:

STAGE 1: DATA VALIDATION
- Check reliability of current price, latest candle anatomy, RSI, MACD, Bollinger Bands, and S/R levels.
- If essential metrics are missing or contradictory, default to "WAIT" with low confidence (< 45%).

STAGE 2: MARKET REGIME CLASSIFICATION
- Classify the active chart timeframe into: [Trending Bullish], [Trending Bearish], [Ranging Chop], or [Volatility Squeeze].
- Trend-following entries are STRICTLY FORBIDDEN in Ranging Chop.

STAGE 3: PRICE ACTION & 5-CANDLE ANATOMY
- Inspect the 5-candle progression on the chart.
- Check body expansion vs compression and upper/lower wick rejection spikes (hammers, shooting stars).
- Verify momentum is actively expanding in the trade direction without stalling opposing wicks.

STAGE 4: MARKET STRUCTURE
- Bullish: Higher Highs (HH) + Higher Lows (HL).
- Bearish: Lower Highs (LH) + Lower Lows (LL).
- Sideways: Overlapping bodies / wicks without directional expansion.

STAGE 5: PRICE LOCATION (CRITICAL RISK FLOOR)
- HARD RULE: NEVER BUY directly under Resistance (R1) or Upper Bollinger Band.
- HARD RULE: NEVER SELL directly on Support (S1) or Lower Bollinger Band.
- Ideal BUY Location: Pullback to EMA20 / Bollinger Middle Band with lower wick rejection, or clean breakout above R1.
- Ideal SELL Location: Pullback to EMA20 / Bollinger Middle Band with upper wick rejection, or clean breakdown below S1.

STAGE 6: MOMENTUM DYNAMICS
- Bullish: RSI > 52 and rising (positive slope), MACD histogram expanding upward.
- Bearish: RSI < 48 and falling (negative slope), MACD histogram expanding downward.

STAGE 7: INDICATOR CONVERGENCE
- Moving Averages (Price vs EMA20 vs EMA50) must align with RSI and MACD.
- Any conflict between primary indicators immediately disqualifies a Grade-A trade.

STAGE 8: SETUP IDENTIFICATION
Identify the exact setup:
1. TREND_CONTINUATION_PULLBACK (Pullback to EMA20/Middle Band with rejection candle in trend direction).
2. SR_REJECTION (Strong bounce off major Support or rejection off Resistance).
3. BOLLINGER_MEAN_REVERSION (Band overshoot + RSI exhaustion + reversal candle).
4. BREAKOUT_CONFIRMATION (Clean close beyond S/R with momentum surge).
5. NO_CLEAR_SETUP (Mixed signals -> MUST BE "WAIT").

STAGE 9: BUY vs SELL COMPETITION SCORING
- Bullish Score: 0 to 10
- Bearish Score: 0 to 10
- Wait / Noise Score: 0 to 10
To issue BUY: Bullish Score >= 7.5 AND Bullish Score - Bearish Score >= 3.0.
To issue SELL: Bearish Score >= 7.5 AND Bearish Score - Bullish Score >= 3.0.
Otherwise, the output MUST be "WAIT".

STAGE 10: CALIBRATED CONFIDENCE & FINAL VERDICT
- 85% - 95%: Flawless confluence across all 3 pillars (Trend + Momentum + Anatomy).
- 78% - 84%: High-Probability Grade-A setup.
- 65% - 74%: Marginal / Gray Zone -> MUST DOWNGRADE SIGNAL TO "WAIT" (Calibrated Confidence: 40-50%).
- < 65%: Noise / Choppy -> Signal MUST BE "WAIT" (Calibrated Confidence: 20-35%).
`;

    let finalPrompt = "";
    if (rawImage) {
      // PRIMARY VISUAL MODE: Extract from screenshot directly!
      finalPrompt = `${INSTITUTIONAL_10_STAGE_SYSTEM_PROMPT}

The user has provided a chart screenshot of ${body.symbol} on the ${body.timeframe} timeframe (${body.tradeDuration} trade duration).
Visible indicators on chart: ${(baseRequest.visibleIndicators || []).join(", ") || "Candlestick price action, RSI, MACD, Bollinger Bands, Moving Averages"}.

ANALYSIS INSTRUCTIONS:
1. Extract current price, 5 recent candles, support/resistance levels, RSI line & value, MACD lines & histogram, and Bollinger Bands / Moving Averages directly from the chart image.
2. Strictly execute the 10-STAGE DECISION PIPELINE based on your visual observations of the chart.
`;
    } else if (body.dataSource === "twelvedata") {
      finalPrompt = `${INSTITUTIONAL_10_STAGE_SYSTEM_PROMPT}

LIVE STRUCTURED MARKET DATASET TO ANALYZE:
======
${extractedTextData}
======

Calculate Stop Loss (SL) and Take Profit (TP) levels dynamically:
- For BUY: SL = 2 pips below nearest_support_s1. TP = 1 pip below nearest_resistance_r1.
- For SELL: SL = 2 pips above nearest_resistance_r1. TP = 1 pip above nearest_support_s1.
`;
    } else {
      finalPrompt = `${INSTITUTIONAL_10_STAGE_SYSTEM_PROMPT}

The user is trading ${body.symbol} on the ${body.timeframe} timeframe with ${body.tradeDuration} duration.
Live data:
======
${extractedTextData || "Rely on standard market structure."}
======

Apply the 10-stage institutional decision pipeline strictly.
`;
    }

    const jsonInstruction = `
Format your answer strictly as a pure JSON object with no markdown fences, preamble, or trailing text:
{
  "trend": "Bullish" | "Bearish" | "Sideways",
  "signal": "BUY" | "SELL" | "WAIT",
  "marketState": "Regime description (e.g. Trend Continuation Pullback, Range Bound Chop, Resistance Trap)",
  "entryPrice": number | null,
  "takeProfit": number | null,
  "stopLoss": number | null,
  "confidence": number,
  "readiness": "READY" | "GOOD" | "FAIR" | "NOT READY",
  "setup": "TREND_CONTINUATION_PULLBACK" | "SR_REJECTION" | "BOLLINGER_MEAN_REVERSION" | "BREAKOUT_CONFIRMATION" | "NO_CLEAR_SETUP",
  "scores": {
    "bullish": number,
    "bearish": number,
    "wait": number
  },
  "reasoning": "2-3 sentence institutional rationale explaining candle anatomy, location, and momentum metrics.",
  "explanation": "1-sentence executive summary"
}
`;

    const finalAnalysis = await callProvider({ ...baseRequest, promptOverride: finalPrompt + jsonInstruction, rawOutput: false, isProgressive: false });
    
    // Enforce Boss's strict 75%+ Confidence floor and Gray-Zone Filter
    let calibratedSignal = finalAnalysis.signal || "WAIT";
    let calibratedConfidence = finalAnalysis.confidence || 0;
    
    if ((calibratedSignal === "BUY" || calibratedSignal === "SELL") && calibratedConfidence > 0 && calibratedConfidence < 75) {
      // Gray-zone downgrade: Force WAIT to prevent the 20% win-rate loss trap
      calibratedSignal = "WAIT";
      calibratedConfidence = Math.min(50, calibratedConfidence);
    }

    // Ensure all required fields exist
    const finalData = {
      trend: finalAnalysis.trend || "Sideways",
      signal: calibratedSignal,
      marketState: finalAnalysis.marketState || "Unknown",
      entryPrice: finalAnalysis.entryPrice || finalAnalysis.entry || null,
      takeProfit: finalAnalysis.takeProfit || null,
      stopLoss: finalAnalysis.stopLoss || null,
      confidence: calibratedConfidence,
      readiness: finalAnalysis.readiness || (calibratedConfidence >= 78 ? "READY" : calibratedConfidence >= 60 ? "FAIR" : "NOT READY"),
      setup: finalAnalysis.setup || "NO_CLEAR_SETUP",
      scores: finalAnalysis.scores || undefined,
      reasoning: finalAnalysis.reasoning || "No reasoning provided",
      explanation: finalAnalysis.explanation || "No explanation provided",
      unifiedMarketData: {
        currentPrice: { value: finalAnalysis.entryPrice || finalAnalysis.entry || 0, confidence: 90 },
      }
    };

    const validated = UniversalAIResponseSchema.parse(finalData);

    return NextResponse.json({
      ...validated,
      analysisType: "mobile_visual",
      extractionOnly: false,
      source: "mobile_single_prompt",
      timings: { totalMs: performance.now() - started },
    });
  } catch (error: any) {
    console.error("[Mobile Analysis API Error]", error);
    return NextResponse.json({ error: error?.message || "Mobile chart analysis failed", code: "MOBILE_ANALYSIS_FAILED", analysisType: "mobile_visual" }, { status: 500 });
  }
}
