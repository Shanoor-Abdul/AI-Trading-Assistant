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

function isInvalidNormalizedResult(result: UniversalAIResponse): boolean {
  return result.marketState === "Analysis Failed: Invalid JSON or Schema" ||
    result.explanation?.startsWith("[AI_ANALYSIS_INVALID]") === true;
}

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

    const request = async (retry = false) => {
      const retryInstruction = retry
        ? "\n\nFINAL JSON RETRY: Return the complete JSON object now. Do not truncate. Do not add markdown. Use null/[]/{} for unreadable optional values. Keep evidence arrays concise so the entire object fits in the response."
        : "";

      return openai.chat.completions.create({
        model: currentModel,
        messages: [{
          role: "user",
          content: retry ? [...messagesContent, { type: "text", text: retryInstruction }] : messagesContent,
        }],
        max_tokens: AI_REQUEST_CONFIG.maxOutputTokens,
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(attempt === 1);

      if (!response?.choices?.length) {
        throw new Error(`OpenRouter Model ${currentModel} returned an invalid response.`);
      }

      const text = response.choices[0]?.message?.content ?? "";
      const result = normalizeResponse(text, {
        marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown",
      });

      if (!isInvalidNormalizedResult(result)) {
        return result;
      }

      if (attempt === 0) {
        console.warn(`[OpenRouter] Invalid/incomplete JSON from ${currentModel}; retrying once.`);
        continue;
      }

      throw new Error("AI_ANALYSIS_INVALID: OpenRouter returned invalid or incomplete JSON after retry.");
    }

    throw new Error("AI_ANALYSIS_INVALID: OpenRouter analysis did not produce a valid response.");
  } catch (error: any) {
    console.warn(`OpenRouter model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
