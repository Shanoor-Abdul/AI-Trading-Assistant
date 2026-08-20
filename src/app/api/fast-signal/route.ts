import { NextRequest, NextResponse } from "next/server";
import { generateFastSignal } from "@/lib/engines/FastSignalEngine";
import { analyze } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const started = Date.now();

  try {
    const body = await req.json();

    if (!body?.symbol || !body?.timeframe) {
      return NextResponse.json(
        { error: "symbol and timeframe are required" },
        { status: 400 }
      );
    }

    const completedBatches = Array.isArray(body.progressive)
      ? body.progressive
      : Array.isArray(body.progressive?.analyses)
        ? body.progressive.analyses
        : [];

    let analysisContext = [...completedBatches];
    let partialBatch: any = null;

    // Current frames are not yet a completed 20-frame batch. Process them
    // through the Progressive/Vision layer first, then feed the resulting
    // structured text into the low-latency Fast Signal engine.
    const currentFrames = Array.isArray(body.currentFrames) ? body.currentFrames : [];
    if (currentFrames.length > 0) {
      const progressiveRequest: any = {
        symbol: body.symbol,
        timeframe: body.timeframe,
        platform: body.platform,
        tradeDuration: body.tradeDuration,
        provider: body.progressiveProvider || body.provider,
        model: body.progressiveModel || body.model,
        marketDataMode: body.marketDataMode || "visual_only",
        visibleIndicators: body.visibleIndicators || [],
        selectedStrategies: body.selectedStrategies || [],
        activeConnectionId: body.activeConnectionId || null,
        isProgressive: true,
        progressiveState: completedBatches,
        macroTimeframeImage: body.macroTimeframeImage,
        confirmationTimeframeImage: body.confirmationTimeframeImage,
        structureTimeframeImage: body.structureTimeframeImage,
        primaryTimeframe: {
          timeframe: body.timeframe,
          screenshots: currentFrames,
        },
      };

      const progressiveResult: any = await analyze(progressiveRequest);

      partialBatch = {
        analysisId: progressiveResult.analysisId || crypto.randomUUID(),
        batchId: body.nextBatchId ?? completedBatches.length + 1,
        status: "PARTIAL",
        frameStart: body.currentFrameStart ?? null,
        frameEnd: body.currentFrameEnd ?? null,
        frameCount: currentFrames.length,
        timestamp: new Date().toISOString(),
        trend: progressiveResult.trend || "Unknown",
        momentum: progressiveResult.momentum || "Unknown",
        marketState: progressiveResult.marketState || "Unknown",
        candlestickBehavior: progressiveResult.candlestickBehavior || "Unknown",
        indicatorState: progressiveResult.indicatorState || {},
        strategyConsensus: progressiveResult.strategyConsensus || "Unknown",
        strategyConflicts: progressiveResult.strategyConflicts || [],
        changesFromPrevious: progressiveResult.changesFromPrevious || "None",
        confidence: progressiveResult.confidence || 0,
        unifiedMarketData: progressiveResult.unifiedMarketData,
        source: "partial_progressive",
      };

      analysisContext.push(partialBatch);
    }

    const result = generateFastSignal({
      symbol: body.symbol,
      timeframe: body.timeframe,
      tradeDuration: body.tradeDuration,
      platform: body.platform,
      market: body.market,
      progressive: analysisContext,
    });

    return NextResponse.json({
      trend: result.trend,
      signal: result.signal,
      confidence: result.confidence,
      readiness: result.readiness,
      estimatedConfidence: result.confidence >= 75 ? "HIGH" : result.confidence >= 55 ? "MEDIUM" : "LOW",
      recommendedTimeframe: body.timeframe,
      requiredTimeframe: null,
      requestedIndicators: [],
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      marketState: result.marketState,
      changesFromPrevious: partialBatch
        ? "Fast signal includes all completed batches plus the current partial progressive batch."
        : "Fast signal derived from completed progressive batches.",
      momentum: result.momentum,
      candlestickBehavior: partialBatch?.candlestickBehavior || "From progressive observation state.",
      indicatorState: partialBatch?.indicatorState || {},
      strategyConsensus: result.strategyConsensus,
      strategyConflicts: partialBatch?.strategyConflicts || [],
      evidenceScore: Math.min(100, (result.bullishEvidence.length + result.bearishEvidence.length) * 20),
      signalQuality: result.signalQuality,
      bullishEvidence: result.bullishEvidence,
      bearishEvidence: result.bearishEvidence,
      invalidationConditions: result.invalidationConditions,
      confirmationStatus: result.signal === "WAIT" ? "UNCLEAR" : "CONFIRMED",
      explanation: result.explanation,
      reasoning: "Low-latency evaluation of completed progressive batches plus any current partial batch.",
      detectedSymbol: body.symbol,
      detectedTimeframe: body.timeframe,
      exchange: body.platform || "visual_only",
      marketProvider: "visual_only",
      riskDecision: result.signal === "BUY" || result.signal === "SELL" ? "APPROVED" : result.signal,
      dataConfidence: result.dataConfidence,
      marketDataMode: "visual_only",
      marketDataStatus: "available",
      tradeDuration: body.tradeDuration,
      latencyMode: partialBatch ? "PROGRESSIVE_PARTIAL_THEN_LOCAL_TEXT" : result.latencyMode,
      latencyMs: Date.now() - started,
      generatedAt: result.generatedAt,
      progressiveBatchCount: completedBatches.length,
      partialBatch,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Fast signal generation failed" },
      { status: 500 }
    );
  }
}
