import { GoogleGenAI } from "@google/genai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = buildUniversalPrompt(req) + buildPriceLevelInstruction(req);
  const currentModel = req.model || "gemini-2.5-flash";

  try {
    const parts: any[] = [{ text: prompt }];

    if (req.screenshots?.length) {
      for (const shot of req.screenshots) {
        parts.push({ inlineData: { data: shot.base64, mimeType: shot.mimeType } });
      }
    } else if (req.screenshot) {
      parts.push({ inlineData: { data: req.screenshot.base64, mimeType: req.screenshot.mimeType } });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: attempt === 0
          ? parts
          : [...parts, { text: "Return the complete valid JSON object only. Do not truncate. Keep arrays concise and use null for unreadable values." }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 6000,
        },
      });

      const text = response.text || "";
      if (!text.trim()) {
        if (attempt === 0) continue;
        throw new Error("Gemini returned an empty response.");
      }

      try {
        return normalizeResponse(text, {
          marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown",
        });
      } catch (error) {
        if (attempt === 0) {
          console.warn(`[Gemini] Invalid JSON/schema from ${currentModel}; retrying once.`);
          continue;
        }
        throw error;
      }
    }

    throw new Error("Gemini analysis failed after retry.");
  } catch (error: any) {
    console.warn(`Gemini model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
