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
}: {
  imageBase64: string;
  symbol: string;
  timeframe: string;
  model?: string;
  marketData?: any;
  strategyRules?: string;
}): Promise<TradingAnalysis> {
  const prompt = buildTradingPrompt(symbol, timeframe, marketData, strategyRules);

  const image = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  const currentModel = model || "gpt-4o-mini";

  try {
    const response = await openai.chat.completions.create({
      model: currentModel,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image}`,
              },
            },
          ],
        },
      ],
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
