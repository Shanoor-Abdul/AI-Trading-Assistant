import { NextRequest, NextResponse } from "next/server";
import { analyze as analyzeGemini } from "@/lib/ai/providers/gemini";
import { analyze as analyzeOpenAI } from "@/lib/ai/providers/openai";
import { analyze as analyzeGroq } from "@/lib/ai/providers/groq";
import { analyze as analyzeOpenRouter } from "@/lib/ai/providers/openrouter";
import { UniversalAIRequestSchema, UniversalAIResponseSchema } from "@/lib/ai/schema";
import { getModelCapabilities } from "@/lib/ai/providerCapabilities";
import { buildMobileExtractionPrompt } from "@/lib/ai/mobileExtractionPrompt";
import { buildMobileSignalPrompt } from "@/lib/ai/mobileSignalPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageData = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

function getMimeAndBase64(value: string): ImageData {
  if (value.startsWith("data:image/")) {
    const [header, data] = value.split(";base64,");
    const mime = header.replace("data:", "");
    if (data && (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp")) {
      return { mimeType: mime, base64: data };
    }
  }

  return { mimeType: "image/jpeg", base64: value };
}

async function callProvider(req: any) {
  switch (req.provider) {
    case "gemini":
      return analyzeGemini(req);
    case "openai":
      return analyzeOpenAI(req);
    case "groq":
      return analyzeGroq(req);
    case "openrouter":
      return analyzeOpenRouter(req);
    default:
      throw new Error(`AI_PROVIDER_UNAVAILABLE: ${req.provider}`);
  }
}

function hasKnownState(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.toUpperCase() !== "UNKNOWN";
}

function hasExtractionEvidence(extraction: any): boolean {
  if (!extraction || typeof extraction !== "object") return false;

  const indicators = extraction.indicators && typeof extraction.indicators === "object"
    ? Object.values(extraction.indicators as Record<string, any>)
    : [];

  const hasIndicatorEvidence = indicators.some((indicator: any) =>
    indicator && typeof indicator === "object" && (
      indicator.visible === true ||
      Object.values(indicator).some((value) => typeof value === "number" && Number.isFinite(value)) ||
      hasKnownState(indicator.state) ||
      hasKnownState(indicator.position)
    ),
  );

  return [
    extraction.currentPrice?.value != null,
    extraction.candles?.latest?.close != null,
    hasKnownState(extraction.trend?.state),
    hasKnownState(extraction.momentum?.state),
    hasKnownState(extraction.marketStructure?.state),
    extraction.visualEvidence?.length > 0,
    extraction.supportLevels?.length > 0,
    extraction.resistanceLevels?.length > 0,
    hasIndicatorEvidence,
    extraction.visibleIndicators?.length > 0,
  ].some(Boolean);
}

function hasFinalAnalysisEvidence(validated: any): boolean {
  const unified = validated?.unifiedMarketData as any;
  const reasoning = typeof validated?.reasoning === "string" ? validated.reasoning.trim() : "";
  const explanation = typeof validated?.explanation === "string" ? validated.explanation.trim() : "";
  const marketState = typeof validated?.marketState === "string" ? validated.marketState.trim() : "";

  const usableText = [reasoning, explanation, marketState].some(
    (value) => value && value !== "No reasoning provided" && value !== "No explanation provided",
  );

  const hasEvidenceArrays = Boolean(
    validated?.bullishEvidence?.length ||
    validated?.bearishEvidence?.length ||
    validated?.strategyConflicts?.length ||
    validated?.invalidationConditions?.length,
  );

  const hasUnifiedEvidence = [
    unified?.currentPrice?.value != null,
    unified?.completedCandle?.close != null,
    unified?.currentIncompleteCandle?.close != null,
    unified?.supportLevels?.value?.length > 0,
    unified?.resistanceLevels?.value?.length > 0,
    unified?.indicators && Object.values(unified.indicators).some((indicator: any) =>
      indicator && typeof indicator === "object" && (
        indicator.value != null ||
        indicator.visible === true ||
        (typeof indicator.state === "string" && indicator.state !== "UNKNOWN")
      ),
    ),
    typeof unified?.marketStructure?.value === "string" && unified.marketStructure.value.trim().length > 0,
    typeof unified?.trend?.value === "string" && unified.trend.value.trim().length > 0,
    typeof unified?.momentum?.value === "string" && unified.momentum.value.trim().length > 0,
  ].some(Boolean);

  return Boolean(usableText && (hasEvidenceArrays || hasUnifiedEvidence));
}

export async function POST(request: NextRequest) {
  const started = performance.now();

  try {
    const body = await request.json();
    const rawImage = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";

    if (!rawImage) {
      return NextResponse.json(
        { error: "A chart screenshot is required.", code: "MOBILE_IMAGE_MISSING", analysisType: "mobile_visual" },
        { status: 400 },
      );
    }

    if (!body?.symbol || !body?.timeframe || !body?.tradeDuration) {
      return NextResponse.json(
        { error: "symbol, timeframe and tradeDuration are required.", code: "MOBILE_SETTINGS_MISSING", analysisType: "mobile_visual" },
        { status: 400 },
      );
    }

    const provider = typeof body.provider === "string" ? body.provider : "gemini";
    const model = typeof body.model === "string" && body.model.trim() ? body.model : undefined;
    const capabilities = getModelCapabilities(provider, model || "");

    if (!capabilities) {
      return NextResponse.json(
        { error: `Unknown AI provider/model: ${provider}/${model || "default"}`, code: "MOBILE_MODEL_UNKNOWN", analysisType: "mobile_visual" },
        { status: 400 },
      );
    }

    if (!capabilities.vision) {
      return NextResponse.json(
        { error: `Selected AI model (${model || "default"}) does not support image analysis.`, code: "MOBILE_MODEL_NO_VISION", analysisType: "mobile_visual" },
        { status: 400 },
      );
    }

    const image = getMimeAndBase64(rawImage);

    const baseRequest = UniversalAIRequestSchema.parse({
      mode: "visual_only",
      provider,
      model,
      platform: String(body.platform || "Unknown"),
      symbol: String(body.symbol),
      primaryTimeframe: String(body.timeframe),
      tradeDuration: String(body.tradeDuration),
      selectedStrategies: Array.isArray(body.selectedStrategies) ? body.selectedStrategies : ["Auto (AI Selection)"],
      visibleIndicators: Array.isArray(body.visibleIndicators) ? body.visibleIndicators : [],
      screenshot: image,
      promptOverride: "",
      rawOutput: true,
      isProgressive: false,
    });

    // STAGE 1: Vision model extracts factual values/evidence from the image only.
    const extractionPrompt = buildMobileExtractionPrompt(baseRequest);
    const extraction = await callProvider({
      ...baseRequest,
      promptOverride: extractionPrompt,
      rawOutput: true,
      isProgressive: false,
    });

    if (!hasExtractionEvidence(extraction)) {
      return NextResponse.json(
        {
          error: "Mobile extraction returned no usable chart evidence.",
          code: "MOBILE_EXTRACTION_EMPTY",
          analysisType: "mobile_visual",
        },
        { status: 502 },
      );
    }

    // STAGE 2: Text reasoning receives ONLY the extracted structured evidence.
    // The screenshot is intentionally omitted so the second stage cannot re-read/guess pixels.
    const analysisRequest = UniversalAIRequestSchema.parse({
      ...baseRequest,
      screenshot: undefined,
      promptOverride: buildMobileSignalPrompt(baseRequest, extraction),
      rawOutput: false,
      isProgressive: false,
    });

    const result = await callProvider(analysisRequest);
    const validated = UniversalAIResponseSchema.parse(result);

    if (!hasFinalAnalysisEvidence(validated)) {
      return NextResponse.json(
        {
          error: "Mobile signal analysis returned an empty or invalid analysis.",
          code: "MOBILE_ANALYSIS_EMPTY",
          analysisType: "mobile_visual",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ...validated,
      analysisType: "mobile_visual",
      extractionOnly: false,
      source: "mobile_separate",
      mobilePipeline: {
        stages: ["image_extraction", "evidence_analysis"],
        extraction,
      },
      timings: { totalMs: performance.now() - started },
    });
  } catch (error: any) {
    console.error("[Mobile Analysis API Error]", error);
    return NextResponse.json(
      {
        error: error?.message || "Mobile chart analysis failed",
        code: "MOBILE_ANALYSIS_FAILED",
        analysisType: "mobile_visual",
      },
      { status: 500 },
    );
  }
}
