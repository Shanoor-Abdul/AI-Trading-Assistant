import { NextRequest, NextResponse } from "next/server";
import { POST as analyzePOST } from "@/app/api/analyze/route";

/**
 * Dedicated endpoint for background progressive analysis.
 *
 * /api/analyze expects the primary 5m screenshots at the top level as
 * `screenshots`. The progressive client keeps them under `primaryTimeframe`
 * so the MTF context (4h / 1h / 15m) stays separate. Normalize that payload
 * here before delegating to the shared analysis engine.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(`\n[Progressive Analysis] Incoming request for ${body.symbol || "UNKNOWN"} (${body.timeframe || "UNKNOWN"})`);

    const primaryScreenshots = Array.isArray(body?.primaryTimeframe?.screenshots)
      ? body.primaryTimeframe.screenshots
      : [];

    const normalizedBody = {
      ...body,
      isProgressive: true,
      screenshots:
        Array.isArray(body?.screenshots) && body.screenshots.length > 0
          ? body.screenshots
          : primaryScreenshots,
      imageBase64:
        body?.imageBase64 ||
        (primaryScreenshots.length > 0
          ? primaryScreenshots[primaryScreenshots.length - 1]?.base64
          : undefined),
    };

    console.log(`[Progressive Analysis] Normalized Payload. Processing ${normalizedBody.screenshots?.length || 0} primary frames.`);
    if (normalizedBody.macroTimeframeImage) console.log(`[Progressive Analysis] Includes MACRO (4H) context image.`);
    if (normalizedBody.confirmationTimeframeImage) console.log(`[Progressive Analysis] Includes CONFIRMATION (1H) context image.`);
    if (normalizedBody.structureTimeframeImage) console.log(`[Progressive Analysis] Includes STRUCTURE (15M) context image.`);

    if (normalizedBody.screenshots.length === 0 && !normalizedBody.imageBase64) {
      console.log(`[Progressive Analysis] ERROR: No images found in payload.`);
      return NextResponse.json(
        {
          error: "Image(s) are required",
          analysisType: "progressive",
        },
        { status: 400 },
      );
    }

    const normalizedRequest = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(normalizedBody),
    });

    console.log(`[Progressive Analysis] Handing off to AI Vision Extractor -> legacyRoute...`);
    return await analyzePOST(normalizedRequest);
  } catch (error: any) {
    console.error("[Progressive Analysis API Error]:", error);

    return NextResponse.json(
      {
        error: error?.message || "Progressive analysis failed",
        analysisType: "progressive",
      },
      { status: 500 },
    );
  }
}
