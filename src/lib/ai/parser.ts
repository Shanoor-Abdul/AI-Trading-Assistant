import { z } from "zod";
import { TradingAnalysis } from "../types";

// Strict Zod schema for AI response validation
const AIResponseSchema = z.object({
  trend: z.enum(["Bullish", "Bearish", "Sideways"]),
  signal: z.enum(["BUY", "SELL", "WAIT", "UNSURE", "NO_TRADE"]),
  confidence: z.number().min(0).max(100),
  recommendedTimeframe: z.string(),
  requiredTimeframe: z.string().optional(),
  entryPrice: z.number().nullable(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  riskReward: z.number().optional(),
  explanation: z.string(),
  marketRegime: z.string().optional(),
  detectedSymbol: z.string().optional(),
  detectedTimeframe: z.string().optional(),
});

export function parseAIResponse(text: string): TradingAnalysis {
  try {
    // Extract JSON block from the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON payload found in AI response.");
    }
    
    // Clean basic syntax errors that break JSON.parse before Zod gets it
    let cleanJson = jsonMatch[0]
      .replace(/\"\.\s*\"/g, '", "')
      .replace(/\\n/g, "\\\\n");
      
    const parsedJson = JSON.parse(cleanJson);
    
    // Strict Zod Validation
    const validatedData = AIResponseSchema.parse(parsedJson);

    return {
      trend: validatedData.trend,
      signal: validatedData.signal,
      confidence: validatedData.confidence,
      recommendedTimeframe: validatedData.recommendedTimeframe,
      requiredTimeframe: validatedData.requiredTimeframe,
      entryPrice: validatedData.entryPrice,
      stopLoss: validatedData.stopLoss,
      takeProfit: validatedData.takeProfit,
      riskReward: validatedData.riskReward,
      explanation: validatedData.explanation,
      marketRegime: validatedData.marketRegime,
      detectedSymbol: validatedData.detectedSymbol,
      detectedTimeframe: validatedData.detectedTimeframe,
    };
  } catch (error) {
    console.error("[AI Validation Error]", error);
    
    // Safe NO_TRADE fallback on any validation failure
    return {
      trend: "Sideways",
      signal: "NO_TRADE",
      confidence: 0,
      recommendedTimeframe: "",
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      explanation: `[AI_ANALYSIS_INVALID] The AI produced an invalid or improperly formatted response that failed strict safety validation. Reason: ${error instanceof Error ? error.message : "Unknown Zod Error"}`,
    };
  }
}