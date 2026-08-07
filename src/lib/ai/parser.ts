import { TradingAnalysis } from "../types";

export function parseAIResponse(
  text: string
): TradingAnalysis {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    return {
      trend: "Sideways",

      signal: "WAIT",

      confidence: 0,

      recommendedTimeframe: "",

      entryPrice: null,

      stopLoss: null,

      takeProfit: null,

      explanation: text,
    };
  }
}