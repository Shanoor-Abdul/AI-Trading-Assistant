import { buildStage1Prompt } from '@/lib/ai/prompts/stage1Extraction';
import { buildStage2Prompt } from '@/lib/ai/prompts/stage2Reasoning';
import { NextRequest, NextResponse } from "next/server";
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
    const rawImage = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
    if (!rawImage && !body?.extractedTextData) return NextResponse.json({ error: "A chart screenshot or text data is required.", code: "MOBILE_IMAGE_MISSING", analysisType: "mobile_visual" }, { status: 400 });
    if (!body?.symbol || !body?.timeframe || !body?.tradeDuration) return NextResponse.json({ error: "symbol, timeframe and tradeDuration are required.", code: "MOBILE_SETTINGS_MISSING", analysisType: "mobile_visual" }, { status: 400 });

    const provider = typeof body.provider === "string" ? body.provider : "gemini";
    const model = typeof body.model === "string" && body.model.trim() ? body.model : undefined;
    const capabilities = getModelCapabilities(provider, model || "");
    if (!capabilities) return NextResponse.json({ error: `Unknown AI provider/model: ${provider}/${model || "default"}`, code: "MOBILE_MODEL_UNKNOWN", analysisType: "mobile_visual" }, { status: 400 });
    
    // Stage 1: Extraction
    const image = rawImage ? getMimeAndBase64(rawImage) : undefined;
    const baseRequest1 = UniversalAIRequestSchema.parse({
      mode: "visual_only", provider, model, platform: String(body.platform || "Unknown"), symbol: String(body.symbol), primaryTimeframe: String(body.timeframe), tradeDuration: String(body.tradeDuration),
      selectedStrategies: Array.isArray(body.selectedStrategies) ? body.selectedStrategies : ["Auto (AI Selection)"],
      visibleIndicators: Array.isArray(body.visibleIndicators) ? body.visibleIndicators : [], screenshot: image, promptOverride: "", rawOutput: true, isProgressive: false,
    });

    const stage1Prompt = buildStage1Prompt(baseRequest1, body.extractedTextData);

    // Execute Stage 1
    const stage1Raw = await callProvider({ ...baseRequest1, promptOverride: stage1Prompt, rawOutput: true });
    
    // Parse and Validate Stage 1 output
    let stage1Data;
    try {
      // Find JSON block in raw output
      const jsonMatch = typeof stage1Raw === "string" ? stage1Raw.match(/{[\s\S]*}/) : null;
      const jsonString = jsonMatch ? jsonMatch[0] : (typeof stage1Raw === "string" ? stage1Raw : JSON.stringify(stage1Raw));
      stage1Data = JSON.parse(jsonString);
    } catch(e) {
      stage1Data = { currentPrice: null, indicators: {}, visualObservations: ["Failed to parse Stage 1 JSON"] };
    }
    
    // Server Validation (Sanity Checks)
    if (stage1Data.indicators?.RSI?.value !== null && stage1Data.indicators?.RSI?.value !== undefined) {
        if (stage1Data.indicators.RSI.value < 0 || stage1Data.indicators.RSI.value > 100) {
            stage1Data.indicators.RSI.value = null; // Kill hallucinated RSI
        }
    }

    // Stage 2: Reasoning (Text Only)
    // Create request without screenshot so it runs as text-only
    const baseRequest2 = UniversalAIRequestSchema.parse({
      mode: "visual_only", provider, model, platform: String(body.platform || "Unknown"), symbol: String(body.symbol), primaryTimeframe: String(body.timeframe), tradeDuration: String(body.tradeDuration),
      selectedStrategies: Array.isArray(body.selectedStrategies) ? body.selectedStrategies : ["Auto (AI Selection)"],
      visibleIndicators: Array.isArray(body.visibleIndicators) ? body.visibleIndicators : [], promptOverride: "", rawOutput: true, isProgressive: false,
    });
    
    const stage2Prompt = buildStage2Prompt(baseRequest2, stage1Data);

    // Execute Stage 2 (Notice: no screenshot attached so it runs faster as text-only if provider supports it)
    const stage2Raw = await callProvider({ ...baseRequest2, promptOverride: stage2Prompt, rawOutput: true });
    
    let stage2Data;
    try {
      const jsonMatch2 = typeof stage2Raw === "string" ? stage2Raw.match(/{[\s\S]*}/) : null;
      const jsonString2 = jsonMatch2 ? jsonMatch2[0] : (typeof stage2Raw === "string" ? stage2Raw : JSON.stringify(stage2Raw));
      stage2Data = JSON.parse(jsonString2);
    } catch(e) {
      stage2Data = { setupState: "NO_SETUP", direction: "NEUTRAL", signal: "WAIT", confidence: 0, reasoning: "Failed to parse Stage 2 JSON." };
    }

    // Map to UniversalAIResponseSchema to satisfy the frontend UI
    const finalData = {
      trend: stage2Data.direction === "BULLISH" ? "Bullish" : (stage2Data.direction === "BEARISH" ? "Bearish" : "Sideways"),
      signal: stage2Data.signal || "WAIT",
      marketState: `State: ${stage2Data.setupState}. Trigger: ${stage2Data.entryTrigger}`,
      entryPrice: stage2Data.entryPrice || stage1Data.currentPrice || null,
      takeProfit: stage2Data.takeProfit || null,
      stopLoss: stage2Data.stopLoss || null,
      confidence: stage2Data.confidence || 0,
      reasoning: stage2Data.reasoning || "No reasoning provided",
      explanation: `Next Move: ${stage2Data.nextMove?.primary || stage2Data.setupState}. ${stage2Data.reasoning}`,
      invalidationConditions: stage2Data.invalidationConditions || [],
      unifiedMarketData: {
        currentPrice: { value: stage1Data.currentPrice || 0, confidence: 90 },
        indicators: stage1Data.indicators || {}
      }
    };

    const validated = UniversalAIResponseSchema.parse(finalData);

    return NextResponse.json({
      ...validated,
      analysisType: "mobile_visual",
      extractionOnly: false,
      source: "mobile_two_stage_pipeline",
      timings: { totalMs: performance.now() - started },
    });
  } catch (error: any) {
    console.error("[Mobile Analysis API Error]", error);
    return NextResponse.json({ error: error?.message || "Mobile chart analysis failed", code: "MOBILE_ANALYSIS_FAILED", analysisType: "mobile_visual" }, { status: 500 });
  }
}
