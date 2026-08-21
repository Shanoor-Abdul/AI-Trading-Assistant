import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Progressive endpoint is intentionally extraction-only.
 * It returns visual evidence for the later Fast Signal / Red-Team flow.
 */
export async function POST(req: NextRequest) {
  const started = performance.now();

  try {
    const body = await req.json();
    const primaryScreenshots = Array.isArray(body?.primaryTimeframe?.screenshots)
      ? body.primaryTimeframe.screenshots
      : [];
    const screenshots = Array.isArray(body?.screenshots) && body.screenshots.length > 0
      ? body.screenshots
      : primaryScreenshots;

    if (!screenshots.length && !body?.imageBase64) {
      return NextResponse.json({ error: "Image(s) are required", analysisType: "progressive" }, { status: 400 });
    }
    if (!body?.symbol || !body?.timeframe) {
      return NextResponse.json({ error: "symbol and timeframe are required", analysisType: "progressive" }, { status: 400 });
    }

    const result = await analyze({
      imageBase64: body.imageBase64,
      screenshots,
      symbol: body.symbol,
      timeframe: body.timeframe,
      platform: body.platform || "visual_only",
      tradeDuration: body.tradeDuration,
      provider: body.provider || "gemini",
      model: body.model,
      useDualModel: false,
      visibleIndicators: body.visibleIndicators || [],
      selectedStrategies: body.selectedStrategies,
      isProgressive: true,
      progressiveState: body.progressiveState || [],
      partialBatch: body.partialBatch || null,
      previousData: body.previousData,
      marketHistorySummary: body.marketHistorySummary,
      macroTimeframeImage: body.macroTimeframeImage,
      confirmationTimeframeImage: body.confirmationTimeframeImage,
      structureTimeframeImage: body.structureTimeframeImage,
      marketDataMode: "visual_only",
      marketData: undefined,
    } as any);

    const marketState = typeof result.marketState === "string" ? result.marketState.trim() : "";
    const reasoning = typeof result.reasoning === "string" ? result.reasoning.trim() : "";
    const explanation = typeof result.explanation === "string" ? result.explanation.trim() : "";
    const bullishEvidence = Array.isArray(result.bullishEvidence) ? result.bullishEvidence : [];
    const bearishEvidence = Array.isArray(result.bearishEvidence) ? result.bearishEvidence : [];
    const unified = result.unifiedMarketData as any;

    // AI may put the useful visual extraction in unifiedMarketData instead of
    // the prose/evidence fields. The previous validation rejected that valid
    // response and incorrectly reported "empty or invalid analysis".
    const hasStructuredEvidence = !!unified && (
      unified.currentPrice?.value != null ||
      unified.completedCandle?.close != null ||
      unified.currentIncompleteCandle?.close != null ||
      (Array.isArray(unified.frameObservations) && unified.frameObservations.length > 0) ||
      (unified.supportLevels?.value?.length > 0) ||
      (unified.resistanceLevels?.value?.length > 0) ||
      (unified.indicators && Object.keys(unified.indicators).length > 0) ||
      unified.marketStructure?.value != null ||
      unified.trend?.value != null ||
      unified.momentum?.value != null
    );

    const invalidResult =
      result.marketState === "Analysis Failed: Invalid JSON or Schema" ||
      explanation.startsWith("[AI_ANALYSIS_INVALID]") ||
      (!marketState && !reasoning && !explanation &&
        bullishEvidence.length === 0 && bearishEvidence.length === 0 && !hasStructuredEvidence);

    if (invalidResult) {
      return NextResponse.json({
        error: "Progressive AI returned an empty or invalid analysis.",
        analysisType: "progressive",
        extractionOnly: true,
      }, { status: 502 });
    }

    return NextResponse.json({
      ...result,
      analysisType: "progressive",
      extractionOnly: true,
      timings: { totalMs: performance.now() - started },
    });
  } catch (error: any) {
    console.error("[Progressive Analysis API Error]:", error);
    return NextResponse.json({
      error: error?.message || "Progressive analysis failed",
      analysisType: "progressive",
      extractionOnly: true,
    }, { status: 500 });
  }
}
