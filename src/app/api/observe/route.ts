import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.imageBase64 || !body.symbol || !body.timeframe) {
      return NextResponse.json(
        { error: "imageBase64, symbol and timeframe are required" },
        { status: 400 },
      );
    }

    const result = await analyze({
      imageBase64: body.imageBase64,
      symbol: body.symbol,
      timeframe: body.timeframe,
      platform: body.platform,
      tradeDuration: body.tradeDuration,
      provider: body.provider || "gemini",
      model: body.model,
      selectedStrategies: body.selectedStrategies,
      visibleIndicators: body.visibleIndicators || [],
      marketDataMode: "visual_only",
      isProgressive: true,
      progressiveState: body.progressiveState,
    } as any);

    return NextResponse.json({
      ...result,
      analysisId: result.analysisId || crypto.randomUUID(),
      observedAt: Date.now(),
    });
  } catch (error: any) {
    console.error("Live observation failed:", error);
    return NextResponse.json(
      { error: error?.message || "Live observation failed" },
      { status: 500 },
    );
  }
}
