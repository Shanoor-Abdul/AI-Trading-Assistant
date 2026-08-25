import OpenAI from "openai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { buildCandlestickReferenceInstruction } from "../candlestickKnowledge";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG } from "@/config/models";

const openai = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY!, baseURL: "https://openrouter.ai/api/v1" });

function hasMeaningfulProgressiveAnalysis(result: UniversalAIResponse): boolean {
  const unified = result.unifiedMarketData as any;
  return Boolean(result.marketState?.trim() || (result.reasoning?.trim() && result.reasoning !== "No reasoning provided") || result.explanation?.trim() || result.bullishEvidence?.length || result.bearishEvidence?.length || result.invalidationConditions?.length || unified?.currentPrice?.value != null || unified?.completedCandle?.close != null || unified?.currentIncompleteCandle?.close != null || unified?.frameObservations?.length || unified?.supportLevels?.value?.length || unified?.resistanceLevels?.value?.length || (unified?.indicators && Object.keys(unified.indicators).length > 0) || unified?.marketStructure?.value != null || unified?.trend?.value != null || unified?.momentum?.value != null);
}

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = (req.promptOverride || (buildUniversalPrompt(req) + buildPriceLevelInstruction(req))) + buildCandlestickReferenceInstruction();
  const currentModel = req.model || "qwen/qwen-2-vl-7b-instruct:free";
  try {
    const messagesContent: any[] = [];
    const isTextOnlyModel = currentModel.includes("gemma") || currentModel === "openrouter/free";
    if (!isTextOnlyModel) {
      if (req.screenshots?.length) for (const shot of req.screenshots) if (shot?.base64) messagesContent.push({ type: "image_url", image_url: { url: `data:${shot.mimeType};base64,${shot.base64}`, detail: "high" } });
      else if (req.screenshot?.base64) messagesContent.push({ type: "image_url", image_url: { url: `data:${req.screenshot.mimeType};base64,${req.screenshot.base64}`, detail: "high" } });
    }
    messagesContent.push({ type: "text", text: prompt });
    const imageCount = messagesContent.filter(item => item.type === "image_url").length;
    if (req.isProgressive && imageCount === 0) throw new Error("PROGRESSIVE_IMAGE_MISSING: No screenshot image data was retrieved for the AI request.");
    const request = async (retry = false) => openai.chat.completions.create({ model: currentModel, messages: [{ role: "user", content: retry ? [...messagesContent, { type: "text", text: "VISION RETRY: Inspect the chart image again before producing JSON. OCR only values you can actually read. Never guess unreadable values." }] : messagesContent }], max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 6000, 4000), temperature: 0.05, response_format: { type: "json_object" } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(attempt === 1);
      if (!response?.choices?.length) throw new Error(`OpenRouter Model ${currentModel} returned an invalid response.`);
      const text = response.choices[0]?.message?.content ?? "";
      if (!text.trim()) { if (attempt === 0) continue; throw new Error("AI_ANALYSIS_EMPTY: OpenRouter returned an empty response after retry."); }
      if (req.rawOutput) { const match = text.match(/\{[\s\S]*\}/); return (match ? JSON.parse(match[0]) : {}) as any; }
      const result = normalizeResponse(text, { marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown" });
      if (!req.isProgressive || hasMeaningfulProgressiveAnalysis(result)) return result;
    }
    throw new Error("AI_ANALYSIS_EMPTY: OpenRouter analysis failed after retry.");
  } catch (error: any) { console.warn(`OpenRouter model failed: ${currentModel} - ${error.message}`); throw error; }
}
