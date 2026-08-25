import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildFastTextSignalPrompt } from "../fastTextPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { buildCandlestickReferenceInstruction } from "../candlestickKnowledge";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG } from "@/config/models";

const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY!, baseURL: "https://api.groq.com/openai/v1" });
const FAST_TEXT_MODEL = "llama-3.1-8b-instant";

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const currentModel = req.model || FAST_TEXT_MODEL;
  const isFastText = !req.screenshot && (!req.screenshots || req.screenshots.length === 0);
  const basePrompt = isFastText ? buildFastTextSignalPrompt(req) : (buildUniversalPrompt(req) + buildPriceLevelInstruction(req));
  const prompt = (req.promptOverride || basePrompt) + buildCandlestickReferenceInstruction();
  try {
    const messagesContent: any[] = [{ type: "text", text: prompt }];
    if (!isFastText) {
      if (req.screenshots?.length) for (const shot of req.screenshots) messagesContent.push({ type: "image_url", image_url: { url: `data:${shot.mimeType};base64,${shot.base64}` } });
      else if (req.screenshot) messagesContent.push({ type: "image_url", image_url: { url: `data:${req.screenshot.mimeType};base64,${req.screenshot.base64}` } });
    }
    const response = await groq.chat.completions.create({ model: currentModel, messages: [{ role: "user", content: messagesContent }], max_tokens: isFastText ? 350 : AI_REQUEST_CONFIG.maxOutputTokens, temperature: isFastText ? 0 : undefined, response_format: isFastText ? { type: "json_object" } : undefined });
    if (!response?.choices?.length) throw new Error(`Groq Model ${currentModel} returned an invalid response.`);
    const text = response.choices[0]?.message?.content ?? "";
    if (req.rawOutput) { const match = text.match(/\{[\s\S]*\}/); return (match ? JSON.parse(match[0]) : {}) as any; }
    return normalizeResponse(text, { marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown" });
  } catch (error: any) { console.warn(`Groq model failed: ${currentModel} - ${error.message}`); throw error; }
}
