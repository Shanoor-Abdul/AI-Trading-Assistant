import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG, getModelById } from "@/config/models";

const client = new OpenAI({
  apiKey: process.env.HF_TOKEN,
  baseURL: "https://router.huggingface.co/v1",
});

function hasMeaningfulProgressiveAnalysis(result: UniversalAIResponse): boolean {
  const unified = result.unifiedMarketData as any;
  return Boolean(
    result.marketState?.trim() ||
    (result.reasoning?.trim() && result.reasoning !== "No reasoning provided") ||
    result.explanation?.trim() ||
    result.bullishEvidence?.length ||
    result.bearishEvidence?.length ||
    unified?.currentPrice?.value != null ||
    unified?.completedCandle?.close != null ||
    unified?.currentIncompleteCandle?.close != null ||
    (unified?.indicators && Object.keys(unified.indicators).length > 0),
  );
}

function buildPrompt(req: UniversalAIRequest): string {
  if (req.promptOverride?.trim()) return req.promptOverride;
  return buildUniversalPrompt(req) + buildPriceLevelInstruction(req);
}

function buildMessages(req: UniversalAIRequest): any[] {
  const content: any[] = [{ type: "text", text: buildPrompt(req) }];
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

  return [{ role: "user", content }];
}

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  if (!process.env.HF_TOKEN) {
    throw new Error("HUGGINGFACE_API_KEY_MISSING: Set HF_TOKEN on the server.");
  }

  const model = req.model || "Qwen/Qwen2.5-VL-7B-Instruct";
  const configured = getModelById(model);
  if (!configured || configured.provider !== "huggingface" || !configured.vision) {
    throw new Error(`HUGGINGFACE_VISION_UNSUPPORTED: Model ${model} is not configured as a Hugging Face vision model.`);
  }

  const messages = buildMessages(req);
  const imageCount = messages[0].content.filter((item: any) => item.type === "image_url").length;
  if (imageCount === 0 && req.isProgressive) {
    throw new Error("PROGRESSIVE_IMAGE_MISSING: No screenshot image data was supplied.");
  }

  try {
    /*
     * Do NOT use `${model}:fastest` here.
     * `:fastest` asks the HF router to choose from the providers enabled for
     * the user's account. That can fail even when the model exists on HF.
     * Qwen2.5-VL-7B-Instruct currently exposes Featherless AI as its hosted
     * Inference Provider, so route this model explicitly.
     */
    const providerModel = `${model}:featherless-ai`;

    const response = await client.chat.completions.create({
      model: providerModel,
      messages,
      max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 6000, 4000),
      temperature: 0.05,
    });

    const text = response.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("AI_ANALYSIS_EMPTY: Hugging Face returned an empty response.");

    if (req.rawOutput) {
      const match = text.match(/\{[\s\S]*\}/);
      return (match ? JSON.parse(match[0]) : {}) as any;
    }

    const result = normalizeResponse(text, {
      marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown",
    });

    if (!req.isProgressive || hasMeaningfulProgressiveAnalysis(result)) return result;
    throw new Error("AI_ANALYSIS_EMPTY: Hugging Face returned no usable progressive market evidence.");
  } catch (error: any) {
    const message = String(error?.message || error || "Hugging Face analysis failed");

    if (/not supported by any provider|provider.*enabled|featherless/i.test(message)) {
      throw new Error(
        `HUGGINGFACE_PROVIDER_UNAVAILABLE: ${model} is currently routed through Featherless AI. ` +
        `Enable Featherless AI for your Hugging Face account/token, then retry. Original error: ${message}`,
      );
    }

    console.warn(`Hugging Face model failed: ${model} - ${message}`);
    throw error;
  }
}
