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

    const result = generateFastSignal({
      symbol: body.symbol,
      timeframe: body.timeframe,
      tradeDuration: body.tradeDuration,
      platform: body.platform,
      market: body.market,
      progressive: body.progressive,
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
      changesFromPrevious: "Fast signal derived from the latest progressive text state.",
      momentum: result.momentum,
      candlestickBehavior: "From progressive observation state.",
      indicatorState: {},
      strategyConsensus: result.strategyConsensus,
      strategyConflicts: [],
      evidenceScore: result.bullishEvidence.length + result.bearishEvidence.length >= 3 ? 80 : 45,
      signalQuality: result.signalQuality,
      bullishEvidence: result.bullishEvidence,
      bearishEvidence: result.bearishEvidence,
      invalidationConditions: result.invalidationConditions,
      confirmationStatus: result.signal === "WAIT" ? "UNCLEAR" : "CONFIRMED",
      explanation: result.explanation,
      reasoning: "Low-latency deterministic evaluation of already-processed progressive market text.",
      detectedSymbol: body.symbol,
      detectedTimeframe: body.timeframe,
      exchange: body.platform || "visual_only",
      marketProvider: "visual_only",
      riskDecision: result.signal === "BUY" || result.signal === "SELL" ? "APPROVED" : result.signal,
      dataConfidence: result.dataConfidence,
      marketDataMode: "visual_only",
      marketDataStatus: "available",
      tradeDuration: body.tradeDuration,
      latencyMode: result.latencyMode,
      latencyMs: Date.now() - started,
      generatedAt: result.generatedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Fast signal generation failed" },
      { status: 500 }
    );
  }
}
