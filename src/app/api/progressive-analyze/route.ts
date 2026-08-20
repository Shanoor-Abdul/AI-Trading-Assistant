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

    if (normalizedBody.screenshots.length === 0 && !normalizedBody.imageBase64) {
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

    return await analyzePOST(normalizedRequest);
  } catch (error: any) {
    console.error("Progressive Analysis API Error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Progressive analysis failed",
        analysisType: "progressive",
      },
      { status: 500 },
    );
  }
}
