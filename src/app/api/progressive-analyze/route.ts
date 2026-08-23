import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/ai";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const started = performance.now();
  try {
    const body = await req.json();
    const primaryScreenshots = Array.isArray(body?.primaryTimeframe?.screenshots) ? body.primaryTimeframe.screenshots : [];
    const screenshots = Array.isArray(body?.screenshots) && body.screenshots.length > 0 ? body.screenshots : primaryScreenshots;

    if (!screenshots.length && !body?.imageBase64) {
      return NextResponse.json({ error: "Image(s) are required", analysisType: "progressive" }, { status: 400 });
    }

    const validScreenshots = screenshots.filter((shot: any) => typeof shot?.base64 === "string" && shot.base64.trim().length > 0);
    if (screenshots.length > 0 && validScreenshots.length === 0 && !body?.imageBase64) {
      return NextResponse.json({ error: "Progressive image data could not be retrieved from ImageStore.", code: "PROGRESSIVE_IMAGE_MISSING", analysisType: "progressive" }, { status: 400 });
    }

    if (!body?.symbol || !body?.timeframe) {
      return NextResponse.json({ error: "symbol and timeframe are required", analysisType: "progressive" }, { status: 400 });
    }

    // --- DEBUGGING: SAVE FRAMES TO DISK ---
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const debugDir = path.join(process.cwd(), 'debug_frames');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    validScreenshots.forEach((shot: any, index: number) => {
      if (shot.base64) {
        const base64Data = shot.base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(path.join(debugDir, `batch_${timestampStr}_frame_${index + 1}.png`), buffer);
      }
    });
    // --------------------------------------

    const result = await analyze({
      imageBase64: body.imageBase64,
      screenshots: validScreenshots,
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
    const unified = result.unifiedMarketData as any;
    const hasStructuredEvidence = !!unified && (
      unified.currentPrice?.value != null || unified.completedCandle?.close != null || unified.currentIncompleteCandle?.close != null ||
      (Array.isArray(unified.frameObservations) && unified.frameObservations.length > 0) ||
      unified.supportLevels?.value?.length > 0 || unified.resistanceLevels?.value?.length > 0 ||
      (unified.indicators && Object.keys(unified.indicators).length > 0) || unified.marketStructure?.value != null ||
      unified.trend?.value != null || unified.momentum?.value != null
    );

    if (!marketState && !reasoning && !explanation && !hasStructuredEvidence &&
        !(result.bullishEvidence?.length) && !(result.bearishEvidence?.length) && !(result.invalidationConditions?.length)) {
      return NextResponse.json({ error: "Progressive AI returned an empty or invalid analysis.", code: "AI_ANALYSIS_EMPTY", analysisType: "progressive", extractionOnly: true }, { status: 502 });
    }

    // --- DEBUGGING: LOG EXTRACTION RESULT ---
    try {
      const logPath = path.join(debugDir, 'extraction_log.txt');
      const logEntry = `
========================================
TIMESTAMP: ${timestampStr}
BATCH ID/FRAMES: ${validScreenshots.length} frames
SYMBOL: ${body.symbol} | TIMEFRAME: ${body.timeframe}
EXTRACTED FULL RESULT:
${JSON.stringify(result, null, 2)}
========================================
`;
      fs.appendFileSync(logPath, logEntry);
    } catch (e) {
      console.error("Failed to write extraction log:", e);
    }
    // ----------------------------------------

    return NextResponse.json({ ...result, analysisType: "progressive", extractionOnly: true, timings: { totalMs: performance.now() - started } });
  } catch (error: any) {
    console.error("[Progressive Analysis API Error]:", error);
      require("fs").writeFileSync("debug_frames/route_error.txt", error.stack || error.message);
    return NextResponse.json({ error: error?.message || "Progressive analysis failed", analysisType: "progressive", extractionOnly: true }, { status: 500 });
  }
}
