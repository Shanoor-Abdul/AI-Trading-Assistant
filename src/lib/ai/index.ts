import { analyze as analyzeGemini } from "./providers/gemini";
import { analyze as analyzeOpenAI } from "./providers/openai";
import { analyze as analyzeGroq } from "./providers/groq";
import { analyze as analyzeOpenRouter } from "./providers/openrouter";
import { AnalyzeRequest } from "../types";
import { UniversalAIRequest, UniversalAIResponse } from "./schema";
import { PROVIDER_CAPABILITIES } from "./providerCapabilities";

function normalizeAIObservationStatus(result: UniversalAIResponse): UniversalAIResponse {
  // The AI owns the evidence/confidence assessment. The browser must not
  // infer readiness from the number of captured frames.
  if (result.readiness && result.estimatedConfidence && result.readiness !== "NOT READY") {
    return result;
  }

  const evidenceConfidence = Math.max(
    0,
    Math.min(100, Number(result.dataConfidence ?? result.confidence ?? 0)),
  );

  let readiness: UniversalAIResponse["readiness"] = "NOT READY";
  let estimatedConfidence: UniversalAIResponse["estimatedConfidence"] = "LOW";

  if (evidenceConfidence >= 85) {
    readiness = "READY / COMPLETE";
    estimatedConfidence = "HIGH";
  } else if (evidenceConfidence >= 65) {
    readiness = "VERY GOOD";
    estimatedConfidence = "HIGH";
  } else if (evidenceConfidence >= 45) {
    readiness = "GOOD";
    estimatedConfidence = "MEDIUM";
  } else if (evidenceConfidence > 0) {
    readiness = "FAIR";
    estimatedConfidence = "LOW";
  }

  return {
    ...result,
    readiness,
    estimatedConfidence,
  };
}

function buildExactCandleContext(marketData: any): string | undefined {
  const candles = marketData?.recentCandles;
  if (!Array.isArray(candles) || candles.length === 0) return undefined;

  const rows = candles.map((c: any, index: number) => {
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = c.volume == null ? null : Number(c.volume);
    const time = c.openTime ?? c.timestamp ?? null;
    return `#${index + 1} time=${time ?? "NA"} O=${open} H=${high} L=${low} C=${close} V=${volume ?? "NA"}`;
  });

  return [
    "EXACT RECENT OHLC CANDLES — USE THESE VALUES FOR CANDLESTICK PATTERN CHECKS:",
    ...rows,
    "The last row is the newest candle. Do not invent missing candles or prices.",
  ].join("\n");
}

export async function analyze(req: AnalyzeRequest): Promise<UniversalAIResponse> {
  const cap = PROVIDER_CAPABILITIES[req.provider];
  if (!cap) throw new Error(`Unknown AI Provider: ${req.provider}`);

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
      if (parsedMime === "image/jpeg" || parsedMime === "image/png" || parsedMime === "image/webp") mimeType = parsedMime;
      base64Data = parts[1];
    }
  }

  const exactCandleContext = buildExactCandleContext(req.marketData);
  const combinedStrategyRules = [
    req.strategyRules,
    exactCandleContext,
  ].filter(Boolean).join("\n\n");

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
    strategyRules: combinedStrategyRules || undefined,
    visibleIndicators: req.visibleIndicators || [],
    marketData: req.marketData,
    previousAnalysis: req.previousData,
    isProgressive: req.isProgressive,
    progressiveState: req.progressiveState,
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
        timeframe: shot.timestamp ? new Date(shot.timestamp).toLocaleTimeString() : "Current",
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
