import Anthropic from '@anthropic-ai/sdk';
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { buildCandlestickReferenceInstruction } from "../candlestickKnowledge";
import { normalizeResponse } from "../normalizeResponse";
import { AI_REQUEST_CONFIG } from '@/config/models';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY_MISSING: Set ANTHROPIC_API_KEY on the server.");
  }

  const prompt = (req.promptOverride || (buildUniversalPrompt(req) + buildPriceLevelInstruction(req))) + buildCandlestickReferenceInstruction();
  const currentModel = req.model || "claude-sonnet-5";

  const content: any[] = [];
  if (req.screenshot) {
    const cleanBase64 = req.screenshot.base64.replace(/^data:image\/\w+;base64,/, '');
    content.push({
      type: "image",
      source: { type: "base64", media_type: req.screenshot.mimeType || "image/jpeg", data: cleanBase64 },
    });
  }

  if (req.screenshots) {
    for (const shot of req.screenshots) {
      const cleanBase64 = shot.base64.replace(/^data:image\/\w+;base64,/, '');
      content.push({
        type: "image",
        source: { type: "base64", media_type: shot.mimeType || "image/jpeg", data: cleanBase64 },
      });
    }
  }

  content.push({ type: "text", text: prompt });

  const doRequest = async (retry = false, retryInstruction = "") => {
    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: retry ? [...content, { type: "text", text: retryInstruction }] as any : content,
    }];

    const response = await anthropic.messages.create({
      model: currentModel,
      max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 8192, 8192),
      messages,
    });

    const textBlocks = response.content.filter((block) => block.type === 'text');
    return textBlocks.map((block: any) => block.text).join("\n") || "{}";
  };

  let textResponse = await doRequest();

  try {
    const res = normalizeResponse(textResponse);
    if (req.rawOutput) return res;
    return res;
  } catch (error: any) {
    console.error("Anthropic JSON parsing failed. Retrying...", error);
    textResponse = await doRequest(true, `Your previous response was not valid JSON or failed schema validation. Error: ${error?.message || String(error)}. PLEASE return ONLY valid JSON matching the exact requested schema with no markdown wrapping or preamble.`);
    const res = normalizeResponse(textResponse);
    return res;
  }
}
