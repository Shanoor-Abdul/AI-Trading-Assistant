import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
});

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = buildUniversalPrompt(req) + buildPriceLevelInstruction(req);

  const currentModel = req.model || "qwen/qwen-2-vl-7b-instruct:free";

  try {
    try {
      const fs = require('fs');
      const logData = `\n\n[${new Date().toISOString()}] === OPENROUTER OUTGOING ===\n${JSON.stringify({...req, screenshot: req.screenshot ? 'base64...' : undefined, screenshots: req.screenshots ? req.screenshots.length + ' images' : undefined}, null, 2)}`;
      fs.appendFileSync('api-payloads.log', logData);
    } catch (e) {}

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
      max_tokens: 2000,
    });

    if (!response?.choices?.length) {
      throw new Error(`OpenRouter Model ${currentModel} returned an invalid response.`);
    }

    const text = response.choices[0]?.message?.content ?? "";
    return normalizeResponse(text, { marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown" });
  } catch (error: any) {
    console.warn(`OpenRouter model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
