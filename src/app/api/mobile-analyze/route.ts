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

function hasExtractionEvidence(extraction: any): boolean {
  if (!extraction || typeof extraction !== "object") return false;

  return Boolean(
    extraction.currentPrice?.value != null ||
    extraction.candles?.latest?.close != null ||
    extraction.trend?.state && extraction.trend.state !== "UNKNOWN" ||
    extraction.momentum?.state && extraction.momentum.state !== "UNKNOWN" ||
    extraction.marketStructure?.state && extraction.marketStructure.state !== "UNKNOWN" ||
    extraction.visualEvidence?.length ||
    extraction.supportLevels?.length ||
    extraction.resistanceLevels?.length ||
    (extraction.indicators && Object.keys(extraction.indicators).length > 0),
  );
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

    const unified = validated.unifiedMarketData as any;
    const hasFinalEvidence = Boolean(
      validated.explanation?.trim() ||
      validated.reasoning?.trim() ||
      validated.marketState?.trim() ||
      validated.bullishEvidence?.length ||
      validated.bearishEvidence?.length ||
      unified?.currentPrice?.value != null ||
      unified?.completedCandle?.close != null ||
      (unified?.indicators && Object.keys(unified.indicators).length > 0),
    );

    if (!hasFinalEvidence) {
      return NextResponse.json(
        { error: "Mobile signal analysis returned no usable evidence.", code: "MOBILE_ANALYSIS_EMPTY", analysisType: "mobile_visual" },
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
