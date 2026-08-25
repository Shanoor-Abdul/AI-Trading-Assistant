import Anthropic from '@anthropic-ai/sdk';
import { BaseAIRequest } from '../schema';
import { buildUniversalPrompt } from '../universalPrompt';
import { buildFrameExtractionPrompt } from '../frameExtractionPrompt';
import { buildProgressiveReasoningPrompt } from '../progressiveReasoningPrompt';
import { buildApiDataPrompt } from '../apiDataPrompt';
import { AI_REQUEST_CONFIG } from '@/config/models';
import { normalizeResponse } from '../normalizeResponse';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function analyze(req: BaseAIRequest): Promise<any> {
  let systemPrompt = "";
  let userText = "";
  let base64Images: string[] = [];

  if (req.marketDataMode === "api") {
    const { systemInstruction, userPrompt } = buildApiDataPrompt(req as any);
    systemPrompt = systemInstruction;
    userText = userPrompt;
  } else if (req.isProgressive) {
    if (req.extractionOnly && req.screenshots && req.screenshots.length > 0) {
      const { systemInstruction, userPrompt } = buildFrameExtractionPrompt(req as any);
      systemPrompt = systemInstruction;
      userText = userPrompt;
      base64Images.push(req.screenshots[0].base64); 
    } else {
      const { systemInstruction, userPrompt } = buildProgressiveReasoningPrompt(req as any);
      systemPrompt = systemInstruction;
      userText = userPrompt;
    }
  } else {
    const { systemInstruction, userPrompt } = buildUniversalPrompt(req as any);
    systemPrompt = systemInstruction;
    userText = userPrompt;
    if (req.imageBase64) base64Images.push(req.imageBase64);
    if (req.screenshots) {
      base64Images.push(...req.screenshots.map(s => s.base64));
    }
  }

  const content: any[] = [];
  
  for (const b64 of base64Images) {
    const cleanBase64 = b64.replace(/^data:image\/\w+;base64,/, '');
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: cleanBase64
      }
    });
  }
  
  content.push({ type: "text", text: userText });

  const doRequest = async (retry = false, retryInstruction = "") => {
    const messages: Anthropic.MessageParam[] = [
      { 
        role: "user", 
        content: retry ? [...content, { type: "text", text: retryInstruction }] as any : content 
      }
    ];

    const response = await anthropic.messages.create({
      model: req.model || "claude-3-5-sonnet-20241022",
      system: systemPrompt,
      max_tokens: Math.min(AI_REQUEST_CONFIG.maxOutputTokens || 8192, 8192),
      temperature: 0.1,
      messages: messages,
    });

    const block = response.content[0];
    if (block.type === 'text') {
      return block.text;
    }
    return "{}";
  };

  let textResponse = await doRequest();
  
  try {
    return normalizeResponse(textResponse, req.marketDataMode === 'api');
  } catch (error: any) {
    console.error("Anthropic JSON parsing failed. Retrying...", error);
    textResponse = await doRequest(true, `Your previous response was not valid JSON or failed schema validation. Error: ${error?.message || String(error)}. PLEASE return ONLY valid JSON matching the exact requested schema with no markdown wrapping or preamble.`);
    return normalizeResponse(textResponse, req.marketDataMode === 'api');
  }
}
