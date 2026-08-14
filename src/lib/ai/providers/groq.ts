import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = buildUniversalPrompt(req) + buildPriceLevelInstruction(req);
  const currentModel = req.model || "llama-3.2-90b-vision-preview";

  try {
    const messagesContent: any[] = [{ type: "text", text: prompt }];

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

    const response = await groq.chat.completions.create({
      model: currentModel,
      messages: [{ role: "user", content: messagesContent }],
    });

    if (!response?.choices?.length) {
      throw new Error(`Groq Model ${currentModel} returned an invalid response.`);
    }

    const text = response.choices[0]?.message?.content ?? "";
    return normalizeResponse(text, { marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown" });
  } catch (error: any) {
    console.warn(`Groq model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
