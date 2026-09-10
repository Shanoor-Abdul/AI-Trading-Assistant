import Anthropic from "@anthropic-ai/sdk";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse, extractJSON } from "../normalizeResponse";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse | any> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY_MISSING: Set ANTHROPIC_API_KEY on the server.");
  }

  const prompt = req.promptOverride ? req.promptOverride : (buildUniversalPrompt(req) + buildPriceLevelInstruction(req));
  const currentModel = req.model || "claude-sonnet-5";

  const content: any[] = [];
  
  // Helper to safely push image base64
  const pushImage = (imgData: any) => {
    if (!imgData) return;
    const rawStr = typeof imgData === "string" ? imgData : (imgData.image || imgData.base64 || "");
    if (!rawStr || typeof rawStr !== "string") return;
    const cleanBase64 = rawStr.replace(/^data:image\/\w+;base64,/, "");
    const mimeMatch = rawStr.match(/^data:(image\/\w+);base64,/);
    const mimeType = imgData.mimeType || (mimeMatch ? mimeMatch[1] : "image/jpeg");
    content.push({
      type: "image",
      source: { type: "base64", media_type: mimeType as any, data: cleanBase64 },
    });
  };

  if (req.screenshot) pushImage(req.screenshot);
  if (req.screenshots) {
    for (const shot of req.screenshots) pushImage(shot);
  }

  // Inject Multi-Timeframe Captured Frames (4H Macro, 1H Confirmation, 15M Structure)
  if (req.macroTimeframe || (req as any).macroTimeframeImage) {
    pushImage(req.macroTimeframe || (req as any).macroTimeframeImage);
  }
  if (req.confirmationTimeframeImage) {
    pushImage(req.confirmationTimeframeImage);
  }
  if (req.structureTimeframe || (req as any).structureTimeframeImage) {
    pushImage(req.structureTimeframe || (req as any).structureTimeframeImage);
  }

  content.push({ type: "text", text: prompt });

  const doRequest = async (retry = false, retryInstruction = "") => {
    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: retry ? [...content, { type: "text", text: retryInstruction }] as any : content,
    }];

    const maxTokens = 8192; // Safe limit for all Claude 3.5 models without beta headers
    const response = await anthropic.messages.create({
      model: currentModel,
      max_tokens: maxTokens,
      messages,
    });



    if (String(response.stop_reason) === "content_filter" || response.content.length === 0) {
       throw new Error("AI model refused to process the request due to content safety filters.");
    }

    const textBlocks = response.content.filter((block) => block.type === "text");
    const text = textBlocks.map((block: any) => block.text).join("\n");
    if (!text.trim()) {
      throw new Error("AI model returned an empty text response.");
    }
    return text;
  };

  let textResponse;
  try {
    textResponse = await doRequest();
  } catch (error: any) {
    if (error.message.includes("content safety filters")) {
      throw error;
    }
    console.error("Anthropic API failed. Retrying...", error);
    textResponse = await doRequest(true, `Your previous response failed. PLEASE return ONLY valid JSON matching the exact requested schema.`);
  }

  try {
    if (req.rawOutput) return extractJSON(textResponse);
    return normalizeResponse(textResponse);
  } catch (error: any) {
    console.error("Anthropic JSON parsing failed. Retrying...", error);
    textResponse = await doRequest(true, `Your previous response was not valid JSON or failed the requested schema. Error: ${error?.message || String(error)}. PLEASE return ONLY valid JSON matching the exact requested schema with no markdown wrapping or preamble.`);
    if (req.rawOutput) return extractJSON(textResponse);
    return normalizeResponse(textResponse);
  }
}
