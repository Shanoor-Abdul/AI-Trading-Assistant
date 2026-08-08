import { TradingAnalysis } from "../types";

export function parseAIResponse(
  text: string
): TradingAnalysis {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    // Clean common LLM JSON syntax errors
    let cleanJson = jsonMatch[0];
    
    // Fix period instead of comma between properties: ". "property" -> ", "property"
    cleanJson = cleanJson.replace(/\"\.\s*\"/g, '", "');
    
    // Fix unescaped newlines inside strings (very common in explanation fields)
    cleanJson = cleanJson.replace(/\\n/g, "\\\\n"); // double escape existing ones
    // We can't safely replace actual newlines without a full parser, so we rely on standard JSON.parse first
    
    try {
      return JSON.parse(cleanJson);
    } catch (e) {
      // Fallback: Regex extraction if JSON is heavily malformed
      console.warn("JSON.parse failed, attempting regex extraction...");
      
      const extractString = (key: string) => {
        const match = cleanJson.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
        return match ? match[1] : "";
      };
      
      const extractNumber = (key: string) => {
        const match = cleanJson.match(new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`));
        return match ? parseFloat(match[1]) : null;
      };

      return {
        trend: extractString("trend") || "Sideways",
        signal: extractString("signal") || "WAIT",
        confidence: extractNumber("confidence") || 0,
        recommendedTimeframe: extractString("recommendedTimeframe") || "",
        entryPrice: extractNumber("entryPrice"),
        stopLoss: extractNumber("stopLoss"),
        takeProfit: extractNumber("takeProfit"),
        explanation: extractString("explanation") || text,
      };
    }
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