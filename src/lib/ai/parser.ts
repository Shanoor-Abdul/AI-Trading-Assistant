import { z } from "zod";
import { TradingAnalysis } from "../types";

// Strict Zod schema for AI response validation
const AIResponseSchema = z.object({
  trend: z.preprocess((val) => typeof val === "string" ? val.trim().charAt(0).toUpperCase() + val.trim().slice(1).toLowerCase() : val, z.enum(["Bullish", "Bearish", "Sideways"])).catch("Sideways"),
  signal: z.preprocess((val) => typeof val === "string" ? val.toUpperCase().trim().replace(" ", "_") : val, z.enum(["BUY", "SELL", "WAIT", "UNSURE", "NO_TRADE"])).catch("NO_TRADE"),
  confidence: z.coerce.number().min(0).max(100),
  recommendedTimeframe: z.string(),
  requiredTimeframe: z.string().optional(),
  entryPrice: z.union([z.number(), z.string().transform(Number)]).nullable().optional(),
  stopLoss: z.union([z.number(), z.string().transform(Number)]).nullable().optional(),
  takeProfit: z.union([z.number(), z.string().transform(Number)]).nullable().optional(),
  riskReward: z.union([z.number(), z.string().transform(Number)]).optional(),
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
      if (text.includes("User Safety:")) {
        throw new Error(`The selected free model's safety filter blocked the chart analysis or it failed to format its response. Please try using a different AI model (like Gemini). Raw: ${text}`);
      }
      throw new Error(`No JSON payload found in AI response. Raw output: ${text.substring(0, 200)}...`);
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
      entryPrice: validatedData.entryPrice ?? null,
      stopLoss: validatedData.stopLoss ?? null,
      takeProfit: validatedData.takeProfit ?? null,
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