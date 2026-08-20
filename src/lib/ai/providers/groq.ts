import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildFastTextSignalPrompt } from "../fastTextPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG } from "@/config/models";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

const FAST_TEXT_MODEL = "llama-3.1-8b-instant";

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const currentModel = req.model || FAST_TEXT_MODEL;
  // If there are no images attached, this is a fast text-to-text reasoning pass
  const isFastText = !req.screenshot && (!req.screenshots || req.screenshots.length === 0);
  const prompt = isFastText
    ? buildFastTextSignalPrompt(req)
    : buildUniversalPrompt(req) + buildPriceLevelInstruction(req);

  try {
    const messagesContent: any[] = [{ type: "text", text: prompt }];

    // Fast text mode must remain text-only. This prevents accidental image
    // encoding/upload from becoming part of the latency-critical request.
    if (!isFastText) {
      if (req.screenshots && req.screenshots.length > 0) {
        for (const shot of req.screenshots) {
          messagesContent.push({
            type: "image_url",
            image_url: { url: `data:${shot.mimeType};base64,${shot.base64}` },
          });
        }
      } else if (req.screenshot) {
        messagesContent.push({
          type: "image_url",
          image_url: { url: `data:${req.screenshot.mimeType};base64,${req.screenshot.base64}` },
        });
      }
    }

    const response = await groq.chat.completions.create({
      model: currentModel,
      messages: [{ role: "user", content: messagesContent }],
      max_tokens: isFastText ? 350 : AI_REQUEST_CONFIG.maxOutputTokens,
      temperature: isFastText ? 0 : undefined,
      response_format: isFastText ? { type: "json_object" } : undefined,
    });

    if (!response?.choices?.length) {
      throw new Error(`Groq Model ${currentModel} returned an invalid response.`);
    }

    const text = response.choices[0]?.message?.content ?? "";
    return normalizeResponse(text, {
      marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown",
    });
  } catch (error: any) {
    console.warn(`Groq model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
