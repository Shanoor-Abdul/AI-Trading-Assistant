import OpenAI from "openai";
import { buildTradingPrompt } from "./prompt";
import { parseAIResponse } from "./parser";
import { TradingAnalysis } from "../types";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1",
});

export async function analyzeWithOpenRouter({
  imageBase64,
  symbol,
  timeframe,
  model,
  marketData,
  strategyRules,
  visibleIndicators,
}: {
  imageBase64: string;
  symbol: string;
  timeframe: string;
  model?: string;
  marketData?: any;
  strategyRules?: string;
  visibleIndicators?: string[];
}): Promise<TradingAnalysis> {
  const prompt = buildTradingPrompt(symbol, timeframe, marketData, strategyRules, visibleIndicators);

  const image = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  let currentModel = model || "nvidia/nemotron-nano-12b-v2-vl:free";
  if (currentModel === "nvidia/nemotron-nano-12b-v2-vl") {
    currentModel = "nvidia/nemotron-nano-12b-v2-vl:free";
  }

  try {
    const messagesContent: any[] = [{ type: "text", text: prompt }];

    // Branch logic as per user request:
    // API Mode (marketData exists) -> Text Only (No Image)
    // Visual Only Mode (!marketData) -> Image + Text
    if (!marketData && image) {
      messagesContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${image}` },
      });
    }

    const response = await openai.chat.completions.create({
      model: currentModel,
      messages: [{ role: "user", content: messagesContent }],
    });

    if (!response?.choices?.length) {
      console.error("OpenRouter invalid response:", JSON.stringify(response, null, 2));
      throw new Error(`Model ${currentModel} returned an invalid response (it may be down).`);
    }

    const text = response.choices[0]?.message?.content ?? "";
    return parseAIResponse(text);
  } catch (error: any) {
    console.warn(`OpenRouter model failed: ${currentModel} - ${error.message}`);
    try {
      const fs = require("fs");
      fs.appendFileSync("api-errors.log", `[${new Date().toISOString()}] OpenRouter Error (${currentModel}): ${error?.toString()}\n`);
    } catch (e) {}
    throw error;
  }
}
