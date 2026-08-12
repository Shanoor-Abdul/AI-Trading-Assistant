import OpenAI from "openai";
import { buildTradingPrompt } from "./prompt";
import { parseAIResponse } from "./parser";
import { TradingAnalysis } from "../types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function analyzeWithOpenAI({
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

  const currentModel = model || "gpt-4o-mini";

  try {
    const messagesContent: any[] = [{ type: "text", text: prompt }];

    if (!marketData && image) {
      messagesContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${image}` },
      });
    }

    const response = await openai.chat.completions.create({
      model: currentModel,
      response_format: {
        type: "json_object",
      },
      messages: [{ role: "user", content: messagesContent }],
    });

    const text = response.choices[0]?.message?.content ?? "";
    return parseAIResponse(text);
  } catch (error) {
    console.warn(`OpenAI model failed: ${currentModel}`);
    try {
      const fs = require("fs");
      fs.appendFileSync("api-errors.log", `[${new Date().toISOString()}] OpenAI Error (${currentModel}): ${error?.toString()}\n`);
    } catch (e) {}
    throw error;
  }
}
