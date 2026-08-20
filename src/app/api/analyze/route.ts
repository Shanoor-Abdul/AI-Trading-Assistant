import { NextRequest, NextResponse } from "next/server";
import { generateFastSignal } from "@/lib/engines/FastSignalEngine";
import { POST as legacyAnalyzePOST } from "./legacyRoute";

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

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Dual OFF: no screenshots, no provider call. Progressive JSON is the sole input.
  if (!body?.useDualModel) {
    if (!body?.symbol || !body?.timeframe) {
      return NextResponse.json({ error: "symbol and timeframe are required" }, { status: 400 });
    }
    const completed = getBatches(body.progressive);
    const partialBatch = body.partialBatch || null;
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

  // Dual ON: the final reasoning model receives structured JSON only. The legacy
  // route is retained for all existing market-data/risk/persistence behavior.
  // Inject the ephemeral partial batch into progressiveState so it cannot be lost
  // even though the legacy route predates the explicit partialBatch field.
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
