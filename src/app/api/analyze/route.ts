import { NextRequest, NextResponse } from "next/server";
import { generateFastSignal } from "@/lib/engines/FastSignalEngine";
import { POST as legacyAnalyzePOST } from "./legacyRoute";
import { POST as progressiveAnalyzePOST } from "../progressive-analyze/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBatches(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.analyses)) return value.analyses;
  if (Array.isArray(value?.progressive)) return value.progressive;
  return [];
}

function buildFastResponse(body: any, result: ReturnType<typeof generateFastSignal>, completedCount: number, partialBatch: any) {
  return {
    trend: result.trend,
    signal: result.signal,
    confidence: result.confidence,
    readiness: result.readiness,
    estimatedConfidence: result.confidence >= 75 ? "HIGH" : result.confidence >= 55 ? "MEDIUM" : "LOW",
    recommendedTimeframe: body.timeframe,
    requiredTimeframe: null,
    requestedIndicators: body.visibleIndicators || [],
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    marketState: result.marketState,
    changesFromPrevious: partialBatch
      ? "Fast signal evaluates completed progressive batches plus the current ephemeral partial batch."
      : "Fast signal evaluates completed progressive batches only.",
    momentum: result.momentum,
    candlestickBehavior: partialBatch?.candlestickBehavior || "From progressive observation state.",
    indicatorState: partialBatch?.indicatorState || {},
    strategyConsensus: result.strategyConsensus,
    strategyConflicts: partialBatch?.strategyConflicts || [],
    evidenceScore: result.evidenceScore,
    signalQuality: result.signalQuality,
    bullishEvidence: result.bullishEvidence,
    bearishEvidence: result.bearishEvidence,
    invalidationConditions: result.invalidationConditions,
    confirmationStatus: result.signal === "WAIT" ? "UNCLEAR" : result.transition === "REVERSAL_DEVELOPING" ? "DEVELOPING" : "CONFIRMED",
    explanation: result.explanation,
    reasoning: `Local temporal evidence engine: ${result.marketRegime} regime, ${result.selectedStrategy}, transition ${result.transition}.`,
    detectedSymbol: body.symbol,
    detectedTimeframe: body.timeframe,
    exchange: body.platform || "visual_only",
    marketProvider: "visual_only",
    riskDecision: result.signal === "BUY" || result.signal === "SELL" ? "APPROVED" : result.signal,
    dataConfidence: result.dataConfidence,
    marketDataMode: body.marketDataMode || "visual_only",
    marketDataStatus: "available",
    tradeDuration: body.tradeDuration,
    latencyMode: result.latencyMode,
    latencyMs: 0,
    generatedAt: result.generatedAt,
    progressiveBatchCount: completedCount,
    partialBatch,
    currentFrameCount: result.currentFrameCount,
    transition: result.transition,
  };
}

async function makeEphemeralPartialBatch(body: any, completed: any[]): Promise<any | null> {
  if (body?.partialBatch) return body.partialBatch;
  const screenshots = Array.isArray(body?.screenshots) ? body.screenshots : [];
  if (!screenshots.length) return null;

  // The dashboard's final request can contain a time-decayed selection of frames.
  // The newest frames are the current observation window; only those are sent to
  // Progressive API. Fast Signal itself never sees images and never calls a model.
  const currentFrames = screenshots.slice(-Math.min(5, screenshots.length));
  const progressiveBody = {
    symbol: body.symbol,
    timeframe: body.timeframe,
    platform: body.platform,
    tradeDuration: body.tradeDuration,
    provider: body.provider,
    model: body.model,
    marketDataMode: body.marketDataMode || "visual_only",
    visibleIndicators: body.visibleIndicators || [],
    selectedStrategies: body.selectedStrategies || [],
    activeConnectionId: body.activeConnectionId || null,
    isProgressive: true,
    progressiveState: completed,
    primaryTimeframe: {
      timeframe: body.timeframe,
      screenshots: currentFrames,
    },
  };

  const request = new NextRequest(body.__progressiveUrl || "http://localhost/api/progressive-analyze", {
    method: "POST",
    headers: body.__headers || { "Content-Type": "application/json" },
    body: JSON.stringify(progressiveBody),
  });
  const response = await progressiveAnalyzePOST(request);
  if (!response.ok) return null;
  const data: any = await response.json();
  if (!data?.marketState && !data?.unifiedMarketData) return null;

  return {
    analysisId: data.analysisId || crypto.randomUUID(),
    batchId: completed.length + 1,
    status: "PARTIAL",
    frameStart: null,
    frameEnd: null,
    frameCount: currentFrames.length,
    timestamp: new Date().toISOString(),
    trend: data.trend || "Unknown",
    momentum: data.momentum || "Unknown",
    marketState: data.marketState || "Unknown",
    candlestickBehavior: data.candlestickBehavior || "Unknown",
    indicatorState: data.indicatorState || {},
    strategyConsensus: data.strategyConsensus || "Unknown",
    strategyConflicts: data.strategyConflicts || [],
    changesFromPrevious: data.changesFromPrevious || "None",
    confidence: data.confidence || 0,
    unifiedMarketData: data.unifiedMarketData,
    source: "partial_progressive",
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // If this is a Progressive Analysis request (e.g., from progressiveAnalyzePOST or the client),
  // it MUST use the Vision model to extract candle/momentum state. Route it to legacyRoute.
  if (body?.isProgressive) {
    const forwardedRequest = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(body),
    });
    return legacyAnalyzePOST(forwardedRequest);
  }

  // Dual OFF: Progressive Vision may create the ephemeral current partial batch;
  // the final decision itself is always local deterministic reasoning.
  if (!body?.useDualModel) {
    if (!body?.symbol || !body?.timeframe) {
      return NextResponse.json({ error: "symbol and timeframe are required" }, { status: 400 });
    }
    const completed = getBatches(body.progressive);
    let partialBatch = body.partialBatch || null;

    if (!partialBatch && Array.isArray(body.screenshots) && body.screenshots.length) {
      try {
        partialBatch = await makeEphemeralPartialBatch({
          ...body,
          __progressiveUrl: new URL("../progressive-analyze", req.url).toString(),
          __headers: req.headers,
        }, completed);
      } catch (error) {
        console.warn("[Fast flow] Current partial Progressive extraction failed:", error);
      }
    }

    const context = partialBatch ? [...completed, partialBatch] : completed;
    if (!context.length && !body.market) {
      return NextResponse.json({ error: "No progressive JSON evidence available. Run Progressive Analysis first.", signal: "WAIT", confidence: 0 }, { status: 400 });
    }

    const result = generateFastSignal({
      symbol: body.symbol,
      timeframe: body.timeframe,
      tradeDuration: body.tradeDuration,
      platform: body.platform,
      market: body.market,
      progressive: context,
      performance: body.performance,
    });

    return NextResponse.json(buildFastResponse(body, result, completed.length, partialBatch));
  }

  // Dual ON: final reasoning receives structured JSON only. The legacy route is
  // retained for existing market-data/risk/persistence behavior; the ephemeral
  // partial batch is injected into progressiveState and images are stripped.
  const completed = getBatches(body.progressiveState);
  const partialBatch = body.partialBatch || null;
  const mergedProgressiveState = partialBatch ? [...completed, partialBatch] : completed;
  const forwarded = {
    ...body,
    progressiveState: mergedProgressiveState,
    partialBatch: undefined,
    screenshots: undefined,
    imageBase64: undefined,
  };

  const forwardedRequest = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(forwarded),
  });

  return legacyAnalyzePOST(forwardedRequest);
}
