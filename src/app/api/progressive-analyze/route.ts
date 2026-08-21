import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Progressive endpoint is intentionally extraction-only.
 *
 * It must not invoke /api/analyze, RiskEngine, Supabase persistence, or
 * trade execution. The client receives structured visual evidence and the
 * final Fast Signal / Red-Team flow consumes that evidence later.
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
      return NextResponse.json(
        { error: "Image(s) are required", analysisType: "progressive" },
        { status: 400 },
      );
    }

    if (!body?.symbol || !body?.timeframe) {
      return NextResponse.json(
        { error: "symbol and timeframe are required", analysisType: "progressive" },
        { status: 400 },
      );
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

    return NextResponse.json({
      ...result,
      analysisType: "progressive",
      extractionOnly: true,
      timings: {
        totalMs: performance.now() - started,
      },
    });
  } catch (error: any) {
    console.error("[Progressive Analysis API Error]:", error);
    return NextResponse.json(
      {
        error: error?.message || "Progressive analysis failed",
        analysisType: "progressive",
        extractionOnly: true,
      },
      { status: 500 },
    );
  }
}
