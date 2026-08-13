import { analyze as analyzeGemini } from "./providers/gemini";
import { analyze as analyzeOpenAI } from "./providers/openai";
import { analyze as analyzeGroq } from "./providers/groq";
import { analyze as analyzeOpenRouter } from "./providers/openrouter";
import { AnalyzeRequest } from "../types";
import { UniversalAIRequest, UniversalAIResponse } from "./schema";
import { PROVIDER_CAPABILITIES } from "./providerCapabilities";

export async function analyze(req: AnalyzeRequest): Promise<UniversalAIResponse> {
  // Check capabilities
  const cap = PROVIDER_CAPABILITIES[req.provider];
  if (!cap) {
    throw new Error(`Unknown AI Provider: ${req.provider}`);
  }

  const needsVision = !!req.imageBase64;
  if (needsVision && !cap.vision) {
    throw new Error(`AI_MODEL_NO_VISION: Selected AI model (${req.model}) does not support image analysis.`);
  }

  let mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  let base64Data = req.imageBase64 || "";

  if (base64Data.startsWith("data:image/")) {
    const parts = base64Data.split(";base64,");
    if (parts.length === 2) {
      const parsedMime = parts[0].replace("data:", "");
      if (parsedMime === "image/jpeg" || parsedMime === "image/png" || parsedMime === "image/webp") {
        mimeType = parsedMime;
      }
      base64Data = parts[1];
    }
  }

  // Construct UniversalAIRequest
  const universalReq: UniversalAIRequest = {
    mode: req.marketDataMode === "visual_only" || !req.marketData ? "visual_only" : "api_data",
    provider: req.provider,
    model: req.model,
    platform: req.platform || "Auto",
    symbol: req.symbol || "Auto",
    primaryTimeframe: req.timeframe || "Auto",
    confirmationTimeframe: req.confirmationTimeframe,
    trendTimeframe: req.trendTimeframe,
    tradeDuration: req.tradeDuration,
    selectedStrategies: req.selectedStrategies,
    strategyRules: req.strategyRules,
    visibleIndicators: req.visibleIndicators || [],
    marketData: req.marketData,
    previousAnalysis: req.previousData,
    isProgressive: req.isProgressive,
    progressiveState: req.progressiveState,
  };

  if ((req as any).screenshots && (req as any).screenshots.length > 0) {
    const maxImages = cap.maxImageCount || 1;
    let limitedScreenshots = (req as any).screenshots;
    
    // Uniformly downsample frames if the batch exceeds provider limits
    if (limitedScreenshots.length > maxImages) {
      if (maxImages === 1) {
        limitedScreenshots = [limitedScreenshots[limitedScreenshots.length - 1]];
      } else {
        const step = (limitedScreenshots.length - 1) / (maxImages - 1);
        const sampled = [];
        for (let i = 0; i < maxImages - 1; i++) {
          sampled.push(limitedScreenshots[Math.floor(i * step)]);
        }
        sampled.push(limitedScreenshots[limitedScreenshots.length - 1]); // Always include the very last frame
        limitedScreenshots = sampled;
      }
    }

    universalReq.screenshots = limitedScreenshots.map((shot: any) => {
      let b64 = shot.base64 || "";
      let mType = shot.mimeType || "image/jpeg";
      
      if (b64.startsWith("data:image/")) {
        const parts = b64.split(";base64,");
        if (parts.length === 2) {
          const parsedMime = parts[0].replace("data:", "");
          if (parsedMime === "image/jpeg" || parsedMime === "image/png" || parsedMime === "image/webp") {
            mType = parsedMime;
          }
          b64 = parts[1];
        }
      }
      return {
        timeframe: shot.timestamp ? new Date(shot.timestamp).toLocaleTimeString() : "Current",
        mimeType: mType as "image/jpeg" | "image/png" | "image/webp",
        base64: b64
      };
    });
  } else if (base64Data) {
    if (req.previousData && req.previousData.screenshotBase64) {
      // 5m -> 15m workflow
      universalReq.screenshots = [
        {
          timeframe: req.previousData.primaryTimeframe || "Previous",
          mimeType: "image/jpeg", // Assuming previous is jpeg from storage
          base64: req.previousData.screenshotBase64
        },
        {
          timeframe: req.timeframe || "Current",
          mimeType,
          base64: base64Data
        }
      ];
    } else {
      universalReq.screenshot = {
        mimeType,
        base64: base64Data
      };
    }
  }

  // Route to correct provider adapter
  try {
    switch (req.provider) {
      case "gemini":
        return await analyzeGemini(universalReq);
      case "openai":
        return await analyzeOpenAI(universalReq);
      case "groq":
        return await analyzeGroq(universalReq);
      case "openrouter":
        return await analyzeOpenRouter(universalReq);
      default:
        throw new Error(`AI_PROVIDER_UNAVAILABLE: ${req.provider}`);
    }
  } catch (error: any) {
    if (error.message?.includes("AI_ANALYSIS_INVALID")) {
      throw error; // Re-throw normalization errors
    }
    console.error("[AI Provider Error]", error);
    throw new Error(`AI_PROVIDER_UNAVAILABLE: ${error.message}`);
  }
}