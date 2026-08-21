import { NextRequest, NextResponse } from "next/server";
import { generateFastSignal } from "@/lib/engines/FastSignalEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUsableProgressiveBatch(batch: any): boolean {
  if (!batch || batch.status === "INVALID" || batch.analysisType === "invalid") return false;
  if (typeof batch.explanation === "string" && batch.explanation.startsWith("[AI_ANALYSIS_INVALID]")) return false;
  if (batch.marketState === "Analysis Failed: Invalid JSON or Schema" || batch.marketState === "Analysis Failed: Invalid JSON or Filtered") return false;
  return true;
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const body = await req.json();
    if (!body?.symbol || !body?.timeframe) {
      return NextResponse.json({ error: "symbol and timeframe are required" }, { status: 400 });
    }

    const rawBatches = Array.isArray(body.progressive)
      ? body.progressive
      : Array.isArray(body.progressive?.analyses)
        ? body.progressive.analyses
        : [];
<<<<<<< HEAD

    // STRICT CONTRACT: this endpoint never accepts screenshots/currentFrames and
    // never calls an AI provider. Image -> structured JSON belongs to Progressive API.
    const partialBatch = body.partialBatch || null;
    const analysisContext = partialBatch
      ? [...completedBatches, partialBatch]
      : completedBatches;

    if (completedBatches.length === 0 && !partialBatch && !body.market) {
      return NextResponse.json({
        error: "No progressive JSON evidence available. Run Progressive Analysis first.",
        signal: "WAIT",
        confidence: 0,
      }, { status: 400 });
=======
    const completedBatches = rawBatches.filter(isUsableProgressiveBatch);
    const analysisContext = [...completedBatches];
    let partialBatch: any = null;

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
        primaryTimeframe: { timeframe: body.timeframe, screenshots: currentFrames },
      };

      const progressiveResult: any = await analyze(progressiveRequest);
      const invalid = progressiveResult.explanation?.startsWith("[AI_ANALYSIS_INVALID]");
      if (!invalid) {
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
>>>>>>> feature/ai-signal-accuracy2
    }

    const result = generateFastSignal({
      symbol: body.symbol,
      timeframe: body.timeframe,
      tradeDuration: body.tradeDuration,
      platform: body.platform,
      market: body.market,
      progressive: analysisContext,
      performance: body.performance,
    });

    return NextResponse.json({
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
<<<<<<< HEAD
      changesFromPrevious: partialBatch
        ? "Fast signal evaluates completed progressive batches plus the current ephemeral partial batch."
        : "Fast signal evaluates completed progressive batches only.",
=======
      changesFromPrevious: partialBatch ? "Fast signal includes usable completed batches plus the current partial progressive batch." : "Fast signal derived from usable completed progressive batches.",
>>>>>>> feature/ai-signal-accuracy2
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
      reasoning: `Local temporal evidence engine: ${result.marketRegime} regime, ${result.selectedStrategy}, transition ${result.transition}, ${result.bullishEvidence.length} bullish evidence groups, ${result.bearishEvidence.length} bearish evidence groups.`,
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
      latencyMs: Date.now() - started,
      generatedAt: result.generatedAt,
      progressiveBatchCount: completedBatches.length,
      partialBatch,
      currentFrameCount: result.currentFrameCount,
      transition: result.transition,
      reasoningMetrics: {
        marketRegime: result.marketRegime,
        selectedStrategy: result.selectedStrategy,
        progressiveBatchCount: completedBatches.length,
        partialBatchIncluded: Boolean(partialBatch),
        currentFrameCount: result.currentFrameCount,
        transition: result.transition,
        riskReward: result.riskReward,
        evidenceScore: result.evidenceScore,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Fast signal generation failed" }, { status: 500 });
  }
}
