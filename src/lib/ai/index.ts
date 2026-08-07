import { analyzeWithGemini } from "./gemini";
import { analyzeWithGroq } from "./groq";
import { analyzeWithOpenAI } from "./openai";
import { analyzeWithOpenRouter } from "./openrouter";

import { AnalyzeRequest } from "../types";

export async function analyze(
  request: AnalyzeRequest
) {
  const payload = {
    imageBase64: request.imageBase64,
    symbol: request.symbol || "Auto",
    timeframe: request.timeframe || "Auto",
    model: request.model,
    marketData: request.marketData
  };

  switch (request.provider) {
    case "gemini":
      return analyzeWithGemini(payload);

    case "groq":
      return analyzeWithGroq(payload);

    case "openai":
      return analyzeWithOpenAI(payload);

    case "openrouter":
      return analyzeWithOpenRouter(payload);

    default:
      throw new Error("Unknown AI Provider");
  }
}