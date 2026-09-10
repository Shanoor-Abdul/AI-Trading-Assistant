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
        fetch(`${baseUrl}/atr?${baseParams}&time_period=14&outputsize=1`).then(r => r.json()),
        fetch(`${baseUrl}/ema?symbol=${symbol}&interval=${macroInterval}&apikey=${apiKey}&time_period=50&outputsize=1`).then(r => r.json()),
        fetch(`${baseUrl}/ema?symbol=${symbol}&interval=${macroInterval}&apikey=${apiKey}&time_period=200&outputsize=1`).then(r => r.json())
      ];
      
      const [priceRes, rsiRes, macdRes, ema20Res, ema50Res, bbRes, atrRes, macroEmaRes, macroEma200Res] = await Promise.all(endpoints);
      
      if (priceRes.status === "error") throw new Error(priceRes.message);
      if (rsiRes.status === "error") throw new Error(rsiRes.message);
      
      const getHistory = (arr: any[], key: string, limit = 3) => {
          if (!arr || !arr.length) return [];
          // TwelveData returns newest first. We take limit, reverse to show Oldest -> Prev -> Newest
          return arr.slice(0, limit).map((v: any) => parseFloat(v[key])).reverse();
      };

      const closeHistory = getHistory(priceRes.values, 'close', 3);
      const currentPrice = closeHistory[closeHistory.length - 1] || 'N/A';
      
      // Support & Resistance via Local High/Low (Boss's fallback)
      const r1 = priceRes.values?.length ? Math.max(...priceRes.values.map((v: any) => parseFloat(v.high))) : null;
      const s1 = priceRes.values?.length ? Math.min(...priceRes.values.map((v: any) => parseFloat(v.low))) : null;
      
      const pipMultiplier = (symbol.includes("JPY") || symbol.includes("XAU") || symbol.includes("XAG")) ? 100 : 10000;
      
      const pipsUnderResistance = (r1 && currentPrice !== 'N/A') ? ((r1 - (currentPrice as number)) * pipMultiplier).toFixed(1) : 'N/A';
      const pipsAboveSupport = (s1 && currentPrice !== 'N/A') ? (((currentPrice as number) - s1) * pipMultiplier).toFixed(1) : 'N/A';

      
      // Momentum Deltas & Slopes (Feature Engineering)
      const rsiArr = getHistory(rsiRes.values, 'rsi');
      const rsiChange = rsiArr.length === 3 ? (rsiArr[2] - rsiArr[0]).toFixed(2) : 'N/A';
      const currentRsi = rsiArr[rsiArr.length - 1]?.toFixed(2) || 'N/A';

      const macdHistArr = getHistory(macdRes.values, 'macd_hist');
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
      
      const bbUpper = bbRes.values?.[0]?.upper_band ? parseFloat(bbRes.values[0].upper_band).toFixed(4) : 'N/A';
      const bbMiddle = bbRes.values?.[0]?.middle_band ? parseFloat(bbRes.values[0].middle_band).toFixed(4) : 'N/A';
      const bbLower = bbRes.values?.[0]?.lower_band ? parseFloat(bbRes.values[0].lower_band).toFixed(4) : 'N/A';
      
      let bbState = "Normal";
      if (bbUpper !== 'N/A' && bbLower !== 'N/A') {
         const bandWidth = (parseFloat(bbUpper) - parseFloat(bbLower)) / parseFloat(bbMiddle);
         if (bandWidth < 0.001) bbState = "Squeezing (Low Volatility)";
         else if (bandWidth > 0.005) bbState = "Expanding (High Volatility)";
      }

      const atr = atrRes.values?.[0]?.atr ? parseFloat(atrRes.values[0].atr).toFixed(4) : 'N/A';
      const macroEma50 = macroEmaRes.values?.[0]?.ema ? parseFloat(macroEmaRes.values[0].ema).toFixed(4) : 'N/A';
      const macroEma200 = macroEma200Res.values?.[0]?.ema ? parseFloat(macroEma200Res.values[0].ema).toFixed(4) : 'N/A';
      
      const macroTrend = (currentPrice !== 'N/A' && macroEma200 !== 'N/A') 
        ? (parseFloat(String(currentPrice)) > parseFloat(String(macroEma200)) ? "Bullish" : "Bearish") 
        : "Unknown";

      const payloadObj = {
          asset: symbol,
          macro_context: {
              current_price: currentPrice,
              macro_timeframe: macroInterval,
              macro_ema_50: macroEma50,
              macro_ema_200: macroEma200,
              macro_trend: macroTrend
          },
          execution_indicators: {
              timeframe: body.timeframe || "5m",
              rsi_value: currentRsi,
              rsi_3_candle_delta: rsiChange,
              macd_histogram: macd,
              macd_histogram_slope: macdSlope
          },
          market_structure: {
              bollinger_state: bbState,
              nearest_resistance_r1: r1 || 'N/A',
              pips_under_resistance: pipsUnderResistance,
              nearest_support_s1: s1 || 'N/A',
              pips_above_support: pipsAboveSupport
          }
      };

      extractedTextData = JSON.stringify(payloadObj, null, 2);
      rawImage = ""; // Strip out the image so it relies entirely on the math above

      // =========================================================================
      // SOLUTION 1 & 2: LOCAL PRE-FILTER GATEKEEPER & TELEMETRY DASHBOARD
      // Zero AI Tokens spent on flat, trapped, or clearly invalid market conditions
      // =========================================================================
      const numRsi = parseFloat(String(currentRsi));
      const numRsiDelta = parseFloat(String(rsiChange));
      const numPipsToR1 = parseFloat(String(pipsUnderResistance));
      const numPipsToS1 = parseFloat(String(pipsAboveSupport));

      let localFilterTriggered = false;
      let filterReason = "";
      let marketStateTitle = "";
      let recheckTime = "5-10 minutes";

      // Gate 1: Trap under Resistance (Bullish Macro but hitting ceiling with falling momentum)
      if (macroTrend === "Bullish" && !isNaN(numPipsToR1) && numPipsToR1 < 4.0 && !isNaN(numRsiDelta) && numRsiDelta <= 0) {
        localFilterTriggered = true;
        marketStateTitle = "Resistance Ceiling Trap";
        filterReason = `Price is sitting just ${numPipsToR1} pips below R1 Resistance with negative RSI momentum (${numRsiDelta}). High risk of a false breakout rejection.`;
        recheckTime = "Wait 10-15 minutes for a clean structural break above R1.";
      }
      // Gate 2: Trap on Support (Bearish Macro but hitting floor with stalling downward momentum)
      else if (macroTrend === "Bearish" && !isNaN(numPipsToS1) && numPipsToS1 < 4.0 && !isNaN(numRsiDelta) && numRsiDelta >= 0) {
        localFilterTriggered = true;
        marketStateTitle = "Support Floor Trap";
        filterReason = `Price is sitting directly on S1 Support (${numPipsToS1} pips away) with stalling downward momentum (${numRsiDelta} delta). High risk of bounce.`;
        recheckTime = "Wait 10-15 minutes for a clean structural breakdown below S1.";
      }
      // Gate 3: Extreme Volatility Squeeze (Flat / Dead market)
      else if (bbState.includes("Squeezing") && !isNaN(numRsiDelta) && Math.abs(numRsiDelta) < 1.0) {
        localFilterTriggered = true;
        marketStateTitle = "Volatility Squeeze (Dead Market)";
        filterReason = `Market is in an extreme Bollinger Squeeze with flat momentum (${numRsiDelta} delta). Energy is consolidating sideways.`;
        recheckTime = "Standby 15-20 minutes for a volatility breakout.";
      }
      // Gate 4: Macro Trend Disconnect (Trading against the 1H 200 EMA)
      else if (macroTrend === "Bullish" && !isNaN(numRsi) && numRsi < 45 && macdSlope === "Falling") {
        localFilterTriggered = true;
        marketStateTitle = "Deep Pullback Against 1H Trend";
        filterReason = `1H Macro is Bullish, but 5m Micro indicators are strongly declining (RSI: ${numRsi}, MACD: Falling). No valid long setup yet.`;
        recheckTime = "Wait 5-10 minutes for 5m RSI to turn back upward (>50).";
      }
      else if (macroTrend === "Bearish" && !isNaN(numRsi) && numRsi > 55 && macdSlope === "Rising") {
        localFilterTriggered = true;
        marketStateTitle = "Counter-Trend Rally";
        filterReason = `1H Macro is Bearish, but 5m Micro indicators are rallying (RSI: ${numRsi}, MACD: Rising). No valid short setup yet.`;
        recheckTime = "Wait 5-10 minutes for 5m RSI to turn back downward (<50).";
      }
      // Gate 5: Neutral Dead Zone / Choppy Indecision
      else if (macroTrend === "Unknown" || (!isNaN(numRsi) && numRsi >= 46 && numRsi <= 54 && macdSlope === "Flat")) {
        localFilterTriggered = true;
        marketStateTitle = "Neutral Dead Zone (Chop / Consolidation)";
        filterReason = `Market is in an indecisive range (RSI: ${currentRsi}, MACD: Flat). No directional conviction present.`;
        recheckTime = "Standby 10-15 minutes for directional momentum to form.";
      }

      if (localFilterTriggered) {
        const dashboardTelemetry = `🛑 [Zero-Token Gatekeeper Filter]\n` +
          `• State: ${marketStateTitle}\n` +
          `• Reason: ${filterReason}\n` +
          `• Telemetry: 1H Trend: ${macroTrend} | 5m RSI: ${currentRsi} (Δ ${rsiChange}) | MACD: ${macdSlope} | R1: ${pipsUnderResistance}p | S1: ${pipsAboveSupport}p\n` +
          `• Next Check: ${recheckTime} (0 AI Tokens Used)`;

        return NextResponse.json({
          trend: macroTrend,
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

    let finalPrompt = "";
    if (body.dataSource === "twelvedata") {
      finalPrompt = `You are an elite automated risk algorithm and systematic trading assistant. Analyze the provided live structured JSON market dataset. Based on strict convergence logic, determine an explicit execution state: **[BUY]**, **[SELL]**, or **[HOLD]**.
      
Execution Rules:
1. Strictly enforce trend alignment: Never issue a BUY if macro_trend is BEARISH. Never issue a SELL if macro_trend is BULLISH.
2. Protection rules: If macro_trend is BULLISH but execution_indicators show a negative rsi_3_candle_delta (falling pressure) and price is sitting closely underneath a ceiling (pips_under_resistance < 5.0), you MUST output **[HOLD]** to avoid false breakouts.
3. Trigger Buy Conditions: Only BUY if macro_trend is BULLISH, price breaks above/resides near key zones with RSI climbing (>53), and macd_histogram_slope is UP.
4. Trigger Sell Conditions: Only SELL if macro_trend is BEARISH, RSI dropping (<47), and macd_histogram_slope is DOWN.

Calculate Stop Loss (SL) and Take Profit (TP) levels dynamically:
- For BUY: SL goes 2 pips below nearest_support_s1. TP goes 1 pip below nearest_resistance_r1.
- For SELL: SL goes 2 pips above nearest_resistance_r1. TP goes 1 pip above nearest_support_s1.

Format your answer precisely as a pure JSON object with no markdown fences, preamble, or trailing text.
The JSON must have this exact structure:
{
  "signal": "BUY" | "SELL" | "WAIT",
  "entryPrice": number,
  "stopLoss": number,
  "takeProfit": number,
  "confidence": number,
  "explanation": "Provide a brief 2-sentence structural rationale identifying metrics that forced the state."
}

JSON PAYLOAD TO ANALYZE:
======
${extractedTextData}
======
`;
    } else if (extractedTextData) {
      finalPrompt = `You are an expert AI trading assistant. The user is trading ${body.symbol} on the ${body.timeframe} timeframe.
They are considering a trade with a ${body.tradeDuration} duration.
Visible indicators on the chart: ${(baseRequest.visibleIndicators || []).join(", ") || "None specified"}.
Based on the indicators and recent candlestick patterns, you must dynamically determine which trading strategy is best for the current market conditions (e.g. Trend Following, Mean Reversion, Breakout), and strictly apply that strategy to your analysis.

The browser extension has scraped the following live text/data directly from the broker screen or API:
======
${extractedTextData}
======

Carefully read the scraped text to find:
1. The exact current price of the asset.
2. Indicator values (RSI, MACD, Bollinger Bands).

Based ONLY on this data, provide a highly accurate trading signal.`;
    } else {
      finalPrompt = `You are an expert AI trading assistant. The user has provided a screenshot of a trading chart for ${body.symbol} on the ${body.timeframe} timeframe.
They are considering a trade with a ${body.tradeDuration} duration.
Visible indicators on the chart: ${(baseRequest.visibleIndicators || []).join(", ") || "None specified"}.
Based on the indicators and recent candlestick patterns, you must dynamically determine which trading strategy is best for the current market conditions (e.g. Trend Following, Mean Reversion, Breakout), and strictly apply that strategy to your analysis.

First, carefully extract all visible data from the chart image:
1. The exact current price of the asset.
2. Indicator values (e.g., RSI value, MACD lines/histogram, Bollinger Bands position).
3. Any visible support or resistance levels.
4. Trend direction and structure.

Then, based ONLY on the data you extracted, provide a highly accurate trading signal.

CRITICAL RULE FOR ANALYSIS AND SCORING:
1. You must STRICTLY follow the visible chart indicators (RSI, MACD, Bollinger Bands, Moving Averages / SMA) and the exact rules of the selected trading strategy.
2. If the primary indicators (like RSI and MACD) point clearly in the same direction, you should award a high confidence score (80% to 95%), even if there is minor visual noise.
3. Only drop the confidence below 75% if there is a MAJOR contradiction between the primary indicators.
4. Do not be overly timid or artificially conservative. We need actionable signals. If the setup looks solid according to the strategy, confidently give it an 85%+ score so the auto-trader can execute it.`;
    }

    const jsonInstruction = `

Output your final analysis strictly as a JSON object matching this exact structure (and absolutely no markdown formatting outside of the JSON block):
{
  "trend": "Bullish", "Bearish", or "Sideways",
  "signal": "BUY", "SELL", or "WAIT",
  "marketState": "Extremely brief 3-5 word description of market",
  "entryPrice": number,
  "takeProfit": number,
  "stopLoss": number,
  "confidence": number (0-100),
  "reasoning": "A highly concise 1-2 sentence maximum explanation of your decision. Keep it as short as possible to save tokens.",
  "explanation": "Very short 1 sentence summary"
}
`;

    const finalAnalysis = await callProvider({ ...baseRequest, promptOverride: finalPrompt + jsonInstruction, rawOutput: false, isProgressive: false });
    
    // Ensure all required fields exist
    const finalData = {
      trend: finalAnalysis.trend || "Sideways",
      signal: finalAnalysis.signal || "WAIT",
      marketState: finalAnalysis.marketState || "Unknown",
      entryPrice: finalAnalysis.entryPrice || finalAnalysis.entry || null,
      takeProfit: finalAnalysis.takeProfit || null,
      stopLoss: finalAnalysis.stopLoss || null,
      confidence: finalAnalysis.confidence || 0,
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
