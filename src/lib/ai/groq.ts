import OpenAI from "openai";
import { buildTradingPrompt } from "./prompt";
import { parseAIResponse } from "./parser";
import { TradingAnalysis } from "../types";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

const DEFAULT_MODELS = [
  "llama-3.2-90b-vision-preview",
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(
  model: string,
  prompt: string,
  image: string
) {
  return groq.chat.completions.create({
    model,

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
}

export async function analyzeWithGroq({
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

  const models = model
    ? [model, ...DEFAULT_MODELS]
    : DEFAULT_MODELS;

  let lastError: unknown;

  for (const currentModel of models) {
    try {
      const response = await callGroq(
        currentModel,
        prompt,
        image
      );

      const text =
        response.choices[0]?.message?.content ?? "";

      return parseAIResponse(text);
    } catch (error) {
      lastError = error;

      console.warn(`Groq model failed: ${currentModel}`);
      try {
        const fs = require("fs");
        fs.appendFileSync("api-errors.log", `[${new Date().toISOString()}] Groq Error (${currentModel}): ${error?.toString()}\n`);
      } catch (e) {}

      await sleep(1000);
    }
  }

  throw lastError;
}