import { analyze as analyzeGemini } from "./providers/gemini";
import { analyze as analyzeOpenAI } from "./providers/openai";
import { analyze as analyzeGroq } from "./providers/groq";
import { analyze as analyzeOpenRouter } from "./providers/openrouter";
import { AnalyzeRequest } from "../types";
import { UniversalAIRequest, UniversalAIResponse } from "./schema";
import { buildProgressiveReasoningPrompt } from "./progressiveReasoningPrompt";
import { buildFrameExtractionPrompt } from "./frameExtractionPrompt";
import { buildApiDataPrompt } from "./apiDataPrompt";
import { getModelCapabilities } from "./providerCapabilities";
import { applySignalQualification } from "../engines/SignalQualificationEngine";

function normalizeAIObservationStatus(result: UniversalAIResponse): UniversalAIResponse {
  return result;
}

export async function analyze(req: AnalyzeRequest): Promise<UniversalAIResponse> {
  const isFinalDual = !!req.useDualModel && !req.isProgressive;

  // Final dual-model reasoning is deliberately a hot text-only path.
  // The user's selected reasoning model is used directly.
  if (isFinalDual && req.reasoningProvider && req.reasoningModel) {
    req.provider = req.reasoningProvider;
    req.model = req.reasoningModel;
  }

  if (isFinalDual) {
    req.imageBase64 = undefined;
    req.screenshots = [];
    req.macroTimeframeImage = undefined;
    req.confirmationTimeframeImage = undefined;
    req.structureTimeframeImage = undefined;
    req.primaryTimeframe = undefined;
  }

  const cap = getModelCapabilities(req.provider, req.model || "");
  if (!cap) throw new Error(`Unknown AI Provider: ${req.provider}`);

  const needsVision = !!req.imageBase64 || !!req.screenshots?.length || !!req.macroTimeframeImage || !!req.confirmationTimeframeImage || !!req.structureTimeframeImage;
  if (needsVision && !cap.vision) {
    throw new Error(`AI_MODEL_NO_VISION: Selected AI model (${req.model}) does not support image analysis.`);
  }

  let mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
  let base64Data = req.imageBase64 || "";

  if (base64Data.startsWith("data:image/")) {
    const parts = base64Data.split(";base64,");
    if (parts.length === 2) {
      const parsedMime = parts[0].replace("data:", "");
      if (parsedMime === "image/jpeg" || parsedMime === "image/png" || parsedMime === "image/webp") mimeType = parsedMime as any;
      base64Data = parts[1];
    }
  }

  const textReasoningContext = isFinalDual && !req.marketData
    ? {
        progressiveState: req.progressiveState || [],
        partialBatch: (req as any).partialBatch || null,
        marketHistorySummary: req.marketHistorySummary || null,
        previousData: req.previousData || null,
      }
    : req.marketData;

  const universalReq: UniversalAIRequest = {
    mode: textReasoningContext ? "api_data" : (req.marketDataMode === "visual_only" ? "visual_only" : "visual_only"),
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
    marketData: textReasoningContext,
    previousAnalysis: req.previousData,
    isProgressive: req.isProgressive,
    progressiveState: req.progressiveState,
    partialBatch: (req as any).partialBatch,
    marketHistorySummary: req.marketHistorySummary,
    macroTimeframe: (req as any).macroTimeframeImage,
    confirmationTimeframeImage: (req as any).confirmationTimeframeImage,
    structureTimeframe: (req as any).structureTimeframeImage,
    promptOverride: (req as any).promptOverride,
  };

  // Only non-final requests are allowed to carry visual payloads.
  if (!isFinalDual && req.screenshots?.length) {
    const maxImages = cap.maxImageCount || 1;
    let limitedScreenshots = req.screenshots;

    if (limitedScreenshots.length > maxImages) {
      if (maxImages === 1) {
        limitedScreenshots = [limitedScreenshots[limitedScreenshots.length - 1]];
      } else {
        const step = (limitedScreenshots.length - 1) / (maxImages - 1);
        const sampled = [] as any[];
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
  } else if (!isFinalDual && base64Data) {
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
    let result: UniversalAIResponse | undefined;
    if (req.isProgressive && universalReq.screenshots && universalReq.screenshots.length > 0) {
      const extractedFrames = [];
      const shots = universalReq.screenshots;
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        const frameReq = { ...universalReq, screenshots: [shot], promptOverride: buildFrameExtractionPrompt(universalReq), rawOutput: true };
        try {
          let fr: any;
          switch (req.provider) {
            case "gemini": fr = await analyzeGemini(frameReq as any); break;
            case "openai": fr = await analyzeOpenAI(frameReq as any); break;
            case "groq": fr = await analyzeGroq(frameReq as any); break;
            case "openrouter": fr = await analyzeOpenRouter(frameReq as any); break;
            default: throw new Error(`AI_PROVIDER_UNAVAILABLE: ${req.provider}`);
          }
          extractedFrames.push(fr);
        } catch (err: any) {
          extractedFrames.push({ frameIndex: i + 1, extractionStatus: "FAILED", error: err.message });
        }
      }
      const reasoningReq: any = { ...universalReq, screenshots: undefined, screenshot: undefined, progressiveState: extractedFrames, rawOutput: false, isProgressive: false };
      reasoningReq.promptOverride = buildProgressiveReasoningPrompt(reasoningReq);
      switch (req.provider) {
        case "gemini": result = await analyzeGemini(reasoningReq as any); break;
        case "openai": result = await analyzeOpenAI(reasoningReq as any); break;
        case "groq": result = await analyzeGroq(reasoningReq as any); break;
        case "openrouter": result = await analyzeOpenRouter(reasoningReq as any); break;
        default: throw new Error(`AI_PROVIDER_UNAVAILABLE: ${req.provider}`);
      }
      } else {
        if (req.marketDataMode === "api") {
          const apiPrompt = buildApiDataPrompt(universalReq);
          if (universalReq.promptOverride) {
            universalReq.promptOverride = universalReq.promptOverride + "\n\n" + apiPrompt;
          } else {
            universalReq.promptOverride = apiPrompt;
          }
        }
        switch (req.provider) {
          case "gemini": result = await analyzeGemini(universalReq); break;
          case "openai": result = await analyzeOpenAI(universalReq); break;
          case "groq": result = await analyzeGroq(universalReq); break;
          case "openrouter": result = await analyzeOpenRouter(universalReq); break;
          default: throw new Error(`AI_PROVIDER_UNAVAILABLE: ${req.provider}`);
        }
      }
    if (!result) throw new Error("AI analysis resulted in undefined response.");

    if (isFinalDual) {
      return normalizeAIObservationStatus(
        applySignalQualification(result as any) as UniversalAIResponse
      );
    }

    return normalizeAIObservationStatus(result);
  } catch (error: any) {
    if (error.message?.includes("AI_ANALYSIS_INVALID")) throw error;
    console.error("[AI Provider Error]", error);
    
    throw new Error(`AI_PROVIDER_UNAVAILABLE: ${error.message}`);
  }
}
