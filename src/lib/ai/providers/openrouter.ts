import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG, getModelById } from "@/config/models";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
});

function hasMeaningfulProgressiveAnalysis(result: UniversalAIResponse): boolean {
  const unified = result.unifiedMarketData as any;
  return Boolean(
    result.marketState?.trim() ||
    (result.reasoning?.trim() && result.reasoning !== "No reasoning provided") ||
    result.explanation?.trim() ||
    result.bullishEvidence?.length || result.bearishEvidence?.length ||
    result.invalidationConditions?.length || unified?.currentPrice?.value != null ||
    unified?.completedCandle?.close != null || unified?.currentIncompleteCandle?.close != null ||
    unified?.frameObservations?.length || unified?.supportLevels?.value?.length ||
    unified?.resistanceLevels?.value?.length ||
    (unified?.indicators && Object.keys(unified.indicators).length > 0) ||
    unified?.marketStructure?.value != null || unified?.trend?.value != null ||
    unified?.momentum?.value != null
  );
}

function isVisionModel(model: string): boolean {
  const configured = getModelById(model);
  if (configured) return configured.vision;

  // Unknown OpenRouter models must not be guessed as vision-capable.
  // This prevents accidentally sending image_url to a text-only endpoint.
  return false;
}

function isProviderVisionCompatibilityError(error: any): boolean {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("invalid distance too far back") ||
    message.includes("no endpoints found that support image input") ||
    message.includes("image input") ||
    (message.includes("vision") && message.includes("unsupported"))
  );
}

function getFallbackVisionModel(model: string): string | null {
  if (model === "stealth/ox-alpha") return "nvidia/nemotron-nano-12b-v2-vl:free";
  if (model === "qwen/qwen-2-vl-7b-instruct:free") return "nvidia/nemotron-nano-12b-v2-vl:free";
  return null;
}

function buildPrompt(req: UniversalAIRequest): string {
  // promptOverride is authoritative. Mobile Stage 1/Stage 2 already builds
  // the exact prompt it needs, including the candlestick reference when needed.
  // Do not append the universal prompt or candlestick catalog again.
  if (req.promptOverride?.trim()) return req.promptOverride;
  return buildUniversalPrompt(req) + buildPriceLevelInstruction(req);
}

function buildImageContent(req: UniversalAIRequest): any[] {
  const content: any[] = [{ type: "text", text: buildPrompt(req) }];

  // Mobile currently sends one screenshot. If multiple frames are supplied,
  // preserve them for progressive callers but never duplicate the same image.
  const shots = req.screenshots?.length
    ? req.screenshots
    : req.screenshot?.base64
      ? [req.screenshot]
      : [];

  const seen = new Set<string>();
  for (const shot of shots) {
    if (!shot?.base64) continue;
    const key = `${shot.mimeType}:${shot.base64.length}:${shot.base64.slice(0, 32)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    content.push({
      type: "image_url",
      image_url: { url: `data:${shot.mimeType};base64,${shot.base64}` },
    });
  }

  return content;
}

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const currentModel = req.model || "openrouter/free";

  if (!isVisionModel(currentModel) && (req.screenshot?.base64 || req.screenshots?.some((s) => s?.base64))) {
    throw new Error(`OPENROUTER_VISION_UNSUPPORTED: Model ${currentModel} is not configured as vision-capable.`);
  }

  try {
    const messagesContent = buildImageContent(req);
    const imageCount = messagesContent.filter((item) => item.type === "image_url").length;

    if (req.isProgressive && imageCount === 0) {
      throw new Error("PROGRESSIVE_IMAGE_MISSING: No screenshot image data was retrieved for the AI request.");
    }

    const request = async (model: string, retry = false) => {
      const retryInstruction = retry
        ? "\n\nVISION RETRY: Re-read the supplied chart image before producing JSON. OCR every printed price/value that is actually readable, especially the current-price marker and indicator legends. Preserve null for unreadable values. Return valid JSON only."
        : "";

      const content = retry
        ? [...messagesContent, { type: "text", text: retryInstruction }]
        : messagesContent;

      return openai.chat.completions.create({
        model,
        messages: [{ role: "user", content }],
        max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 6000, 4000),
        temperature: 0.05,
        response_format: { type: "json_object" },
      });
    };

    let modelForAttempt = currentModel;
    let lastError: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await request(modelForAttempt, attempt > 0);
        if (!response?.choices?.length) {
          throw new Error(`OpenRouter Model ${modelForAttempt} returned an invalid response.`);
        }

        const text = response.choices[0]?.message?.content ?? "";
        if (!text.trim()) {
          if (attempt < 2) continue;
          throw new Error("AI_ANALYSIS_EMPTY: OpenRouter returned an empty response after retry.");
        }

        if (req.rawOutput) {
          const match = text.match(/\{[\s\S]*\}/);
          return (match ? JSON.parse(match[0]) : {}) as any;
        }

        const result = normalizeResponse(text, {
          marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown",
        });

        if (!req.isProgressive || hasMeaningfulProgressiveAnalysis(result)) return result;
        if (attempt < 2) continue;
        throw new Error("AI_ANALYSIS_EMPTY: OpenRouter returned no usable progressive market evidence after retry.");
      } catch (error: any) {
        lastError = error;
        const fallback = getFallbackVisionModel(modelForAttempt);

        if (attempt === 0 && modelForAttempt === currentModel && isProviderVisionCompatibilityError(error)) {
          continue;
        }

        if (attempt === 1 && fallback && modelForAttempt === currentModel && isProviderVisionCompatibilityError(error)) {
          modelForAttempt = fallback;
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error("AI_ANALYSIS_FAILED: OpenRouter analysis failed after retry.");
  } catch (error: any) {
    console.warn(`OpenRouter model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
