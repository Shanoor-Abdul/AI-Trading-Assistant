import { NextRequest, NextResponse } from "next/server";
import { generateFastSignal } from "@/lib/engines/FastSignalEngine";

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

    // This endpoint is intentionally isolated from the slow analysis pipeline.
    // No CCXT fetch, screenshot upload, database write, or LLM call occurs here.
    const result = generateFastSignal({
      symbol: body.symbol,
      timeframe: body.timeframe,
      tradeDuration: body.tradeDuration,
      platform: body.platform,
      market: body.market,
      progressive: body.progressive,
    });

    return NextResponse.json({
      ...result,
      latencyMs: Date.now() - started,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Fast signal generation failed" },
      { status: 500 }
    );
  }
}
