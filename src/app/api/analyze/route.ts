import { NextRequest, NextResponse } from "next/server";

import { analyze } from "@/lib/ai";

import { AnalyzeRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeRequest;

    if (!body.imageBase64) {
      return NextResponse.json(
        {
          error: "Image is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!body.symbol || body.symbol === "Auto-Detecting...") {
      return NextResponse.json(
        { error: "Trading symbol is required for exact market data fetching." },
        { status: 400 }
      );
    }
    
    if (!body.timeframe || body.timeframe === "Auto-Detecting...") {
      return NextResponse.json(
        { error: "Timeframe is required for exact market data fetching." },
        { status: 400 }
      );
    }

    let marketData = null;
    try {
      const { fetchBinanceData } = await import("@/lib/binance");
      marketData = await fetchBinanceData(body.symbol, body.timeframe);
    } catch (err: any) {
      console.warn("Failed to fetch binance data", err);
      // We can decide to strictly fail or gracefully continue. User said "Never estimate... integrate market data". We should probably strictly fail if data is missing, but maybe binance doesn't have the symbol.
      // Let's just log and pass null, or actually fail. Let's fail if it's a real trading assistant.
      return NextResponse.json({ error: "Failed to fetch exact market data: " + err.message }, { status: 400 });
    }

    const result = await analyze({
      imageBase64: body.imageBase64,
      symbol: body.symbol,
      timeframe: body.timeframe,
      provider: body.provider || "gemini",
      model: body.model,
      marketData
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error?.message ??
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}