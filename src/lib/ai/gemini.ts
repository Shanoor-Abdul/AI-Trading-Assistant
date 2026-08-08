import { GoogleGenAI } from "@google/genai";
import { buildTradingPrompt } from "./prompt";
import { parseAIResponse } from "./parser";
import { TradingAnalysis } from "../types";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const DEFAULT_MODEL = "gemini-2.5-flash";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generate(
  model: string,
  prompt: string,
  image: string
) {
  return ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: image,
            },
          },
        ],
      },
    ],
  });
}

export async function analyzeWithGemini({
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

  const models = [
    model,
    DEFAULT_MODEL,
    "gemini-2.5-pro",
  ].filter(Boolean) as string[];

  let lastError: unknown;

  for (const currentModel of models) {
    try {
      const response = await generate(
        currentModel,
        prompt,
        image
      );

      const text =
        response.text ??
        JSON.stringify(response);

      return parseAIResponse(text);
    } catch (error) {
      lastError = error;

      console.warn(`Gemini model failed: ${currentModel}`);
      try {
        const fs = require("fs");
        fs.appendFileSync("api-errors.log", `[${new Date().toISOString()}] Gemini Error (${currentModel}): ${error?.toString()}\n`);
      } catch (e) {}

      await sleep(1000);
    }
  }

  throw lastError;
}