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
    result.explanation?.trim() || result.bullishEvidence?.length || result.bearishEvidence?.length ||
    result.invalidationConditions?.length || unified?.currentPrice?.value != null ||
    unified?.completedCandle?.close != null || unified?.currentIncompleteCandle?.close != null ||
    unified?.frameObservations?.length || unified?.supportLevels?.value?.length ||
    unified?.resistanceLevels?.value?.length || (unified?.indicators && Object.keys(unified.indicators).length > 0) ||
    unified?.marketStructure?.value != null || unified?.trend?.value != null || unified?.momentum?.value != null
  );
}

function isVisionModel(model: string): boolean {
  const configured = getModelById(model);
  return configured?.vision === true;
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
  const configured = getModelById(model);
  if (configured?.provider === "openrouter" && configured.isFree && model !== "nvidia/nemotron-nano-12b-v2-vl:free") {
    return "nvidia/nemotron-nano-12b-v2-vl:free";
  }
  return null;
}

function buildPrompt(req: UniversalAIRequest): string {
  // Mobile promptOverride is authoritative. It already contains the complete
  // extraction/signal prompt and candlestick catalog. Never append it again.
  if (req.promptOverride?.trim()) return req.promptOverride;
  return buildUniversalPrompt(req) + buildPriceLevelInstruction(req);
}

function buildImageContent(req: UniversalAIRequest): any[] {
  const content: any[] = [{ type: "text", text: buildPrompt(req) }];
  const shots = req.screenshots?.length ? req.screenshots : req.screenshot?.base64 ? [req.screenshot] : [];
  const seen = new Set<string>();

  for (const shot of shots) {
    if (!shot?.base64) continue;
    const key = `${shot.mimeType}:${shot.base64.length}:${shot.base64.slice(0, 32)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    content.push({ type: "image_url", image_url: { url: `data:${shot.mimeType};base64,${shot.base64}` } });
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
      return openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: retry ? [...messagesContent, { type: "text", text: retryInstruction }] : messagesContent }],
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
        if (!response?.choices?.length) throw new Error(`OpenRouter Model ${modelForAttempt} returned an invalid response.`);

        const text = response.choices[0]?.message?.content ?? "";
        if (!text.trim()) {
          if (attempt < 2) continue;
          throw new Error("AI_ANALYSIS_EMPTY: OpenRouter returned an empty response after retry.");
        }

        if (req.rawOutput) {
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) throw new Error("AI_JSON_PARSE_FAILED: OpenRouter returned no JSON object for extraction.");
          return JSON.parse(match[0]) as any;
        }

        const result = normalizeResponse(text, { marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown" });
        if (!req.isProgressive || hasMeaningfulProgressiveAnalysis(result)) return result;
        if (attempt < 2) continue;
        throw new Error("AI_ANALYSIS_EMPTY: OpenRouter returned no usable progressive market evidence after retry.");
      } catch (error: any) {
        lastError = error;
        const fallback = getFallbackVisionModel(modelForAttempt);

        // Do not resend the same large multimodal payload to a failing free
        // provider. Immediately switch to a known vision-capable fallback.
        if (fallback && isProviderVisionCompatibilityError(error)) {
          modelForAttempt = fallback;
          continue;
        }

        // For non-provider errors, allow one normal retry before surfacing it.
        if (attempt < 2 && !isProviderVisionCompatibilityError(error)) continue;
        throw error;
      }
    }

    throw lastError || new Error("AI_ANALYSIS_FAILED: OpenRouter analysis failed after retry.");
  } catch (error: any) {
    console.warn(`OpenRouter model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
