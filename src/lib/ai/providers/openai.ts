import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { buildCandlestickReferenceInstruction } from "../candlestickKnowledge";
import { normalizeResponse } from "../normalizeResponse";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = (req.promptOverride || (buildUniversalPrompt(req) + buildPriceLevelInstruction(req))) + buildCandlestickReferenceInstruction();
  const currentModel = req.model || "gpt-4o";

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

    const response = await openai.chat.completions.create({
      model: currentModel,
      messages: [{ role: "user", content: messagesContent }],
    });

    if (!response?.choices?.length) {
      throw new Error(`OpenAI Model ${currentModel} returned an invalid response.`);
    }

    const text = response.choices[0]?.message?.content ?? "";
    
    if (req.rawOutput) {
      const match = text.match(/\{[\s\S]*\}/);
      return (match ? JSON.parse(match[0]) : {}) as any;
    }

    return normalizeResponse(text, { marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown" });
  } catch (error: any) {
    console.warn(`OpenAI model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
