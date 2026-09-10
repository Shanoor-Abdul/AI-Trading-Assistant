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
import { DeterministicApiDecisionEngine, DeterministicDecisionResult } from "@/lib/engines/DeterministicApiDecisionEngine";
import { TwelveDataIndicatorAdapter } from "@/lib/engines/TwelveDataIndicatorAdapter";

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
    let deterministicData: DeterministicDecisionResult | null = null;

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
      const safeFetchSeries = async (interval: string, size = 100) => {
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

      const safeFetchIndicator = async (endpoint: string, params: Record<string, string>) => {
        try {
          const query = new URLSearchParams({
            symbol,
            apikey: apiKey,
            ...params,
          });
          const res = await fetch(`${baseUrl}/${endpoint}?${query.toString()}`);
          const data = await res.json();
          if (data?.status === "error" || !Array.isArray(data?.values) || data.values.length === 0) {
            return null;
          }
          return data;
        } catch {
          return null;
        }
      };

      // Fast parallel fetch for execution, 1H, and 4H candle series (3 requests only to stay well within free tier limits)
      const [execRes, tf1hRes, tf4hRes] = await Promise.all([
        safeFetchSeries(execInterval, 100),
        safeFetchSeries("1h", 100),
        safeFetchSeries("4h", 100),
      ]);

      if (!execRes.success || !execRes.values.length) {
        throw new Error(`TwelveData API error: ${execRes.message || `Failed to retrieve price series for ${symbol} on ${executionTf}`}. If using the free tier (8 calls/min), please retry in 10-15 seconds.`);
      }

      // Process complete deterministic market structure, S/R, momentum, indicators, and risk calculations
      deterministicData = DeterministicApiDecisionEngine.processTwelveDataMarketData(
        symbol,
        executionTf,
        tf4hRes.values || [],
        tf1hRes.values || [],
        execRes.values || [],
        body.tradeDuration || "5m"
      );

      // Instant fast return in TwelveData API mode: 100% deterministic, zero LLM queuing latency
      const sig = deterministicData.signal;
      const conf = deterministicData.confidence;
      const entry = deterministicData.risk.active.entryPrice;
      const tp = deterministicData.risk.active.takeProfit;
      const sl = deterministicData.risk.active.stopLoss;
      const rr = deterministicData.risk.active.riskRewardRatio;

      const summaryReason = deterministicData.hardGates?.reasons?.length 
        ? deterministicData.hardGates.reasons.join(". ")
        : "Deterministic structural decision.";

      const finalData = {
        trend: deterministicData.timeframeAnalysis["5m"].trend || "Sideways",
        signal: sig,
        marketState: deterministicData.marketRegime || "Unknown",
        marketRegime: deterministicData.marketRegime || "Unknown",
        entryPrice: entry,
        takeProfit: tp,
        stopLoss: sl,
        confidence: conf,
        readiness: conf >= 78 ? "READY" : conf >= 60 ? "FAIR" : "NOT READY",
        setup: deterministicData.setup || "NO_CLEAR_SETUP",
        timeframeAnalysis: deterministicData.timeframeAnalysis,
        dataQuality: deterministicData.dataQuality?.score || 95,
        bullishScore: deterministicData.bullishScore,
        bearishScore: deterministicData.bearishScore,
        directionalBias: deterministicData.directionalBias,
        directionalStrength: deterministicData.directionalStrength,
        tradeQuality: deterministicData.tradeQuality,
        tradeable: deterministicData.tradeable,
        whyBuy: deterministicData.whyBuy || [],
        whyNotBuy: deterministicData.whyNotBuy || [],
        whySell: deterministicData.whySell || [],
        whyNotSell: deterministicData.whyNotSell || [],
        scores: {
          bullish: deterministicData.bullishScore,
          bearish: deterministicData.bearishScore,
          wait: sig === "WAIT" ? 80 : 20
        },
        reasoning: summaryReason,
        explanation: summaryReason,
        riskReward: rr,
        validationAudit: { override: false, reason: summaryReason },
        unifiedMarketData: {
          currentPrice: { value: deterministicData.timeframeAnalysis["5m"].currentPrice || entry || 0, confidence: 95 },
        }
      };

      const validated = UniversalAIResponseSchema.parse(finalData);

      return NextResponse.json({
        ...validated,
        analysisType: "mobile_api",
        extractionOnly: false,
        source: "twelvedata_multi_timeframe_api",
        timings: { totalMs: performance.now() - started },
      });
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
SECTION 14: 7-FACTOR SCORING MODEL (0-100 INDEPENDENTLY FOR BUY AND SELL)
================================================================================
Calculate points for BUY and SELL independently across 7 factors:
1. Higher-Timeframe Alignment: Max 20 pts (4H Macro 10 pts + 1H Confirmation 10 pts)
2. Market Structure: Max 20 pts (5M HH/HL / BOS / CHOCH)
3. Momentum: Max 15 pts (RSI 8 pts + MACD 7 pts)
4. Entry Location: Max 15 pts (EMA stack / Pullback zone)
5. Support / Resistance: Max 10 pts (Clear room to barrier / Level bounce)
6. Risk / Reward: Max 10 pts (RR >= 1.5 -> 10 pts, RR >= 1.1 -> 5 pts)
7. Entry Confirmation: Max 10 pts (Trigger candle price action / anatomy)
TOTAL = Exactly 100 points maximum. Missing factors contribute 0 points.

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
- Issue **BUY** when bullishScore >= 75 AND bullishScore >= bearishScore + 10 AND tradeQuality >= 70 AND RR >= 1.1 AND no hard-blocks trigger.
- Issue **SELL** when bearishScore >= 75 AND bearishScore >= bullishScore + 10 AND tradeQuality >= 70 AND RR >= 1.1 AND no hard-blocks trigger.
- Issue **STRONG_BUY** when bullishScore >= 85 AND bullishScore - bearishScore >= 20 AND tradeQuality >= 80 AND RR >= 1.5 AND confirmed trigger candle.
- Issue **STRONG_SELL** when bearishScore >= 85 AND bearishScore - bullishScore >= 20 AND tradeQuality >= 80 AND RR >= 1.5 AND confirmed trigger candle.
- Issue **WAIT** when tradeQuality < 70, scores are balanced, confirmation missing, poor location, chop, RR < 1.1, or hard-block trap conditions are active.

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
    const validationAudit = { override: false, reason: "Analysis completed" };

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
      dataQuality: finalAnalysis.dataQuality || 85,
      bullishScore: finalAnalysis.bullishScore || finalAnalysis.scores?.bullish || (calibratedSignal === "BUY" ? calibratedConfidence : 20),
      bearishScore: finalAnalysis.bearishScore || finalAnalysis.scores?.bearish || (calibratedSignal === "SELL" ? calibratedConfidence : 20),
      directionalBias: calibratedSignal === "BUY" ? "BULLISH" : calibratedSignal === "SELL" ? "BEARISH" : "NEUTRAL",
      directionalStrength: calibratedConfidence || 0,
      tradeQuality: calibratedConfidence || 0,
      tradeable: calibratedSignal === "BUY" || calibratedSignal === "SELL",
      whyBuy: Array.isArray(finalAnalysis.whyBuy) ? finalAnalysis.whyBuy : [],
      whyNotBuy: Array.isArray(finalAnalysis.whyNotBuy) ? finalAnalysis.whyNotBuy : [],
      whySell: Array.isArray(finalAnalysis.whySell) ? finalAnalysis.whySell : [],
      whyNotSell: Array.isArray(finalAnalysis.whyNotSell) ? finalAnalysis.whyNotSell : [],
      scores: finalAnalysis.scores || {
        bullish: finalAnalysis.bullishScore || (calibratedSignal === "BUY" ? calibratedConfidence : 20),
        bearish: finalAnalysis.bearishScore || (calibratedSignal === "SELL" ? calibratedConfidence : 20),
        wait: calibratedSignal === "WAIT" ? 80 : 20
      },
      reasoning: finalAnalysis.reasoning || validationAudit.reason,
      explanation: finalAnalysis.explanation || validationAudit.reason,
      riskReward: finalAnalysis.riskReward,
      validationAudit,
      unifiedMarketData: {
        currentPrice: { value: finalAnalysis.entryPrice || finalAnalysis.entry || 0, confidence: 95 },
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

