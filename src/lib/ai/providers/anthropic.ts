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
  const currentModel = req.model || "claude-haiku-4-5-20251001";

  const content: any[] = [];
  if (req.screenshot) {
    const cleanBase64 = req.screenshot.base64.replace(/^data:image\/\w+;base64,/, "");
    content.push({
      type: "image",
      source: { type: "base64", media_type: req.screenshot.mimeType || "image/jpeg", data: cleanBase64 },
    });
  }

  if (req.screenshots) {
    for (const shot of req.screenshots) {
      const cleanBase64 = shot.base64.replace(/^data:image\/\w+;base64,/, "");
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

    const maxTokens = currentModel.includes("sonnet") || currentModel.includes("3-7") ? 16384 : 8192;
    const response = await anthropic.messages.create({
      model: currentModel,
      max_tokens: maxTokens,
      messages,
    });

    try {
      require("fs").writeFileSync(req.rawOutput ? "anthropic_stage1_debug.json" : "anthropic_stage2_debug.json", JSON.stringify(response, null, 2));
    } catch (e) {}

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
