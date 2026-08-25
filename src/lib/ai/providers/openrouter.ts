import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { buildCandlestickReferenceInstruction } from "../candlestickKnowledge";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG } from "@/config/models";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "Accept-Encoding": "identity",
    "Connection": "keep-alive",
  },
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
  const m = model.toLowerCase();
  return !m.includes("gemma") && m !== "openrouter/free";
}

function isProviderVisionCompatibilityError(error: any): boolean {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("invalid distance too far back") ||
    message.includes("no endpoints found that support image input") ||
    message.includes("image input") ||
    message.includes("vision") && message.includes("unsupported");
}

function getFallbackVisionModel(model: string): string | null {
  // Keep the user's selected model as the first choice. If a free/stealth
  // provider rejects the multimodal request, use OpenRouter's vision-aware
  // free router rather than returning an opaque provider error.
  if (model === "stealth/ox-alpha") return "openrouter/free";
  if (model === "qwen/qwen-2-vl-7b-instruct:free") return "openrouter/free";
  return null;
}

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = (req.promptOverride || (buildUniversalPrompt(req) + buildPriceLevelInstruction(req))) + buildCandlestickReferenceInstruction();
  const currentModel = req.model || "qwen/qwen-2-vl-7b-instruct:free";

  try {
    const messagesContent: any[] = [];
    const canSendImages = isVisionModel(currentModel);

    // OpenRouter's current multimodal contract expects the text part and image
    // part in the same content array. Text-first is the documented ordering.
    // Do not send provider-specific `detail` here: support varies by model and
    // can cause otherwise-valid free/stealth vision endpoints to reject the
    // request.
    messagesContent.push({ type: "text", text: prompt });

    if (canSendImages) {
      if (req.screenshots?.length) {
        for (const shot of req.screenshots) {
          if (!shot?.base64) continue;
          messagesContent.push({
            type: "image_url",
            image_url: { url: `data:${shot.mimeType};base64,${shot.base64}` },
          });
        }
      } else if (req.screenshot?.base64) {
        messagesContent.push({
          type: "image_url",
          image_url: { url: `data:${req.screenshot.mimeType};base64,${req.screenshot.base64}` },
        });
      }
    }

    const imageCount = messagesContent.filter((item) => item.type === "image_url").length;
    if (req.isProgressive && imageCount === 0) {
      throw new Error("PROGRESSIVE_IMAGE_MISSING: No screenshot image data was retrieved for the AI request.");
    }

    const request = async (model: string, retry = false, compact = false) => {
      const retryInstruction = retry
        ? "\n\nVISION RETRY: Inspect the chart image again before producing JSON. OCR every printed price/value you can actually read, especially the current-price marker and right-side axis labels. Identify each indicator panel from its visual structure. Populate concrete visualEvidence. Never replace unreadable values with guesses."
        : "";

      // Some third-party free/stealth endpoints are less tolerant of very large
      // prompts combined with image embeddings. On the compatibility retry we
      // keep the image but ask for the same structured extraction in a compact
      // form, allowing the provider to recover without changing the pipeline.
      const compactInstruction = compact
        ? "\n\nCOMPACT VISION MODE: Prioritize direct OCR of current price and all printed indicator values, then inspect the latest 20 readable candles and report only concrete visual evidence. Preserve null for unreadable values. Return valid JSON only."
        : "";

      return openai.chat.completions.create({
        model,
        messages: [{
          role: "user",
          content: retry || compact
            ? [...messagesContent, { type: "text", text: retryInstruction + compactInstruction }]
            : messagesContent,
        }],
        max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 6000, 4000),
        temperature: 0.05,
        response_format: { type: "json_object" },
      });
    };

    let modelForAttempt = currentModel;
    let lastError: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await request(modelForAttempt, attempt > 0, attempt === 1 && modelForAttempt === currentModel);
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

        // The known "invalid distance too far back" error is a provider-side
        // multimodal failure. Retry once with the compact prompt, then fall back
        // to OpenRouter's vision-aware router for free models. This keeps the
        // mobile API alive while preserving the same extraction/analysis flow.
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
