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

    if (req.screenshots && req.screenshots.length > 0) {
      for (const shot of req.screenshots) {
        parts.push({
          inlineData: {
            data: shot.base64,
            mimeType: shot.mimeType,
          },
        });
      }
    } else if (req.screenshot) {
      parts.push({
        inlineData: {
          data: req.screenshot.base64,
          mimeType: req.screenshot.mimeType,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: currentModel,
      contents: parts,
    });

    const text = response.text || "";

    return normalizeResponse(text, { marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown" });
  } catch (error: any) {
    console.warn(`Gemini model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
