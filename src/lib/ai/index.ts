import { analyze as analyzeGemini } from "./providers/gemini";
import { analyze as analyzeOpenAI } from "./providers/openai";
import { analyze as analyzeGroq } from "./providers/groq";
import { analyze as analyzeOpenRouter } from "./providers/openrouter";
import { AnalyzeRequest } from "../types";
import { UniversalAIRequest, UniversalAIResponse } from "./schema";
import { PROVIDER_CAPABILITIES } from "./providerCapabilities";

function normalizeAIObservationStatus(result: UniversalAIResponse): UniversalAIResponse {
  // AI-supplied readiness/confidence remains authoritative. Do not infer a
  // stronger trading state merely because more frames were captured.
  return result;
}

export async function analyze(req: AnalyzeRequest): Promise<UniversalAIResponse> {
  const cap = PROVIDER_CAPABILITIES[req.provider];
  if (!cap) throw new Error(`Unknown AI Provider: ${req.provider}`);

  const needsVision = !!req.imageBase64 || !!(req as any).screenshots?.length;
  if (needsVision && !cap.vision) {
    throw new Error(`AI_MODEL_NO_VISION: Selected AI model (${req.model}) does not support image analysis.`);
  }

  let mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  let base64Data = req.imageBase64 || "";

  if (base64Data.startsWith("data:image/")) {
    const parts = base64Data.split(";base64,");
    if (parts.length === 2) {
      const parsedMime = parts[0].replace("data:", "");
      if (parsedMime === "image/jpeg" || parsedMime === "image/png" || parsedMime === "image/webp") mimeType = parsedMime;
      base64Data = parts[1];
    }
  }

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
    macroTimeframe: (req as any).macroTimeframe,
    confirmationTimeframeImage: (req as any).confirmationTimeframe,
    structureTimeframe: (req as any).structureTimeframe,
    primaryTimeframePayload: (req as any).primaryTimeframe,
  };

  if ((req as any).screenshots && (req as any).screenshots.length > 0) {
    const maxImages = cap.maxImageCount || 1;
    let limitedScreenshots = (req as any).screenshots;

    if (limitedScreenshots.length > maxImages) {
      if (maxImages === 1) {
        limitedScreenshots = [limitedScreenshots[limitedScreenshots.length - 1]];
      } else {
        const step = (limitedScreenshots.length - 1) / (maxImages - 1);
        const sampled = [];
        for (let i = 0; i < maxImages - 1; i++) sampled.push(limitedScreenshots[Math.floor(i * step)]);
        sampled.push(limitedScreenshots[limitedScreenshots.length - 1]);
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
          if (parsedMime === "image/jpeg" || parsedMime === "image/png" || parsedMime === "image/webp") mType = parsedMime;
          b64 = parts[1];
        }
      }
      return {
        timeframe: shot.timeframe || (shot.timestamp ? new Date(shot.timestamp).toLocaleTimeString() : "Current"),
        mimeType: mType as "image/jpeg" | "image/png" | "image/webp",
        base64: b64,
      };
    });
  } else if (base64Data) {
    if (req.previousData && req.previousData.screenshotBase64) {
      universalReq.screenshots = [
        { timeframe: req.previousData.primaryTimeframe || "Previous", mimeType: "image/jpeg", base64: req.previousData.screenshotBase64 },
        { timeframe: req.timeframe || "Current", mimeType, base64: base64Data },
      ];
    } else {
      universalReq.screenshot = { mimeType, base64: base64Data };
    }
  }

  try {
    let result: UniversalAIResponse;
    switch (req.provider) {
      case "gemini": result = await analyzeGemini(universalReq); break;
      case "openai": result = await analyzeOpenAI(universalReq); break;
      case "groq": result = await analyzeGroq(universalReq); break;
      case "openrouter": result = await analyzeOpenRouter(universalReq); break;
      default: throw new Error(`AI_PROVIDER_UNAVAILABLE: ${req.provider}`);
    }
    return normalizeAIObservationStatus(result);
  } catch (error: any) {
    if (error.message?.includes("AI_ANALYSIS_INVALID")) throw error;
    console.error("[AI Provider Error]", error);
    throw new Error(`AI_PROVIDER_UNAVAILABLE: ${error.message}`);
  }
}
