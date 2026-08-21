import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG } from "@/config/models";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
});

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = buildUniversalPrompt(req) + buildPriceLevelInstruction(req);
  const currentModel = req.model || "qwen/qwen-2-vl-7b-instruct:free";

  try {
    const messagesContent: any[] = [{ type: "text", text: prompt }];
    const isTextOnlyModel = currentModel.includes("gemma") || currentModel === "openrouter/free";

    if (!isTextOnlyModel) {
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
    } else {
      console.log(`[OpenRouter] Silently stripping images for text-only model: ${currentModel}`);
    }

    const response = await openai.chat.completions.create({
      model: currentModel,
      messages: [{ role: "user", content: messagesContent }],
      max_tokens: AI_REQUEST_CONFIG.maxOutputTokens,
      // Keep the existing prompt/schema validation as the source of truth,
      // while asking compatible OpenAI-compatible endpoints for JSON output.
      response_format: { type: "json_object" },
    });

    if (!response?.choices?.length) {
      throw new Error(`OpenRouter Model ${currentModel} returned an invalid response.`);
    }

    const text = response.choices[0]?.message?.content ?? "";
    return normalizeResponse(text, {
      marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown",
    });
  } catch (error: any) {
    console.warn(`OpenRouter model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
