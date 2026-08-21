import { NextRequest, NextResponse } from "next/server";
import { generateFastSignal } from "@/lib/engines/FastSignalEngine";
import { POST as legacyAnalyzePOST } from "./legacyRoute";
import { getEngineConfigMetrics } from "@/lib/engines/EngineVersion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBatches(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.analyses)) return value.analyses;
  if (Array.isArray(value?.progressive)) return value.progressive;
  return [];
}

function buildFastResponse(body: any, result: ReturnType<typeof generateFastSignal>, completedCount: number, partialBatch: any) {
  const metrics = getEngineConfigMetrics();
  
  return {
    engineMetrics: metrics,
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
    changesFromPrevious: partialBatch
      ? "Fast signal evaluates completed progressive batches plus the current ephemeral partial batch."
      : "Fast signal evaluates completed progressive batches only.",
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
    reasoning: `Local temporal evidence engine: ${result.marketRegime} regime, ${result.selectedStrategy}, transition ${result.transition}.`,
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
    latencyMs: 0,
    generatedAt: result.generatedAt,
    progressiveBatchCount: completedCount,
    partialBatch,
    currentFrameCount: result.currentFrameCount,
    transition: result.transition,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // If this is a Progressive Analysis request (e.g., from the client),
  // it MUST use the Vision model to extract candle/momentum state. Route it to legacyRoute.
  if (body?.isProgressive) {
    const forwardedRequest = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(body),
    });
    return legacyAnalyzePOST(forwardedRequest);
  }

  // Both Dual OFF and Dual ON require deterministic Fast Signal first
  if (!body?.symbol || !body?.timeframe) {
    return NextResponse.json({ error: "symbol and timeframe are required" }, { status: 400 });
  }
  
  const completed = getBatches(body.progressive || body.progressiveState);
  let partialBatch = body.partialBatch || null;
  const context = partialBatch ? [...completed, partialBatch] : completed;
  
  console.log(`\n[Fast Signal Engine] Request received for ${body.symbol} (${body.timeframe})`);
  console.log(`[Fast Signal Engine] Progressive Context: ${completed.length} batches, ${partialBatch ? '1 partial' : '0 partial'}`);
  
  if (!context.length && !body.market) {
    console.log(`[Fast Signal Engine] VETO - No progressive evidence available.`);
    return NextResponse.json({ error: "No progressive JSON evidence available. Run Progressive Analysis first.", signal: "WAIT", confidence: 0 }, { status: 400 });
  }

  // 1. Run Fast Signal Engine (Deterministic Engine)
  const result = generateFastSignal({
    symbol: body.symbol,
    timeframe: body.timeframe,
    tradeDuration: body.tradeDuration,
    platform: body.platform,
    market: body.market,
    progressive: context,
    performance: body.performance,
  });
  
  console.log(`[Fast Signal Engine] Result -> ${result.signal} (Score: ${result.evidenceScore}) | ${result.explanation}`);

  const fastResponse = buildFastResponse(body, result, completed.length, partialBatch);

  // Dual OFF: Return immediately
  if (!body?.useDualModel) {
    console.log(`[Fast Signal Engine] Dual Mode OFF. Returning deterministic signal directly.`);
    return NextResponse.json(fastResponse);
  }

  // Dual ON: Phase 4 Red Team Validator
  // If Fast Signal === WAIT, just return WAIT without calling Red Team.
  if (result.signal === "WAIT") {
    console.log(`[Red Team Validator] Bypassed because Fast Signal is already WAIT.`);
    fastResponse.explanation += " (Red Team Validator bypassed due to WAIT signal).";
    return NextResponse.json(fastResponse);
  }

  console.log(`[Red Team Validator] Candidate Signal is ${result.signal}. Engaging Red Team AI for rigorous VETO validation...`);

  // 3. The Red Team AI receives the Fast Signal proposal and attempts to invalidate it.
  try {
    const redTeamUrl = new URL("/api/analyze/red-team", req.nextUrl.origin).toString();
    const redTeamReq = await fetch(redTeamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposedSignal: result.signal,
        progressive: context,
        marketSnapshot: context[context.length - 1]?.unifiedMarketData || context[context.length - 1] || {},
        provider: body.reasoningProvider || body.provider,
        model: body.reasoningModel || body.model,
      })
    });

    if (!redTeamReq.ok) {
      throw new Error(`Red Team API error: ${redTeamReq.statusText}`);
    }

    const redTeamRes = await redTeamReq.json();

    // 4. If Red Team AI finds strong bearish contradiction for a BUY, veto the trade -> WAIT.
    if (redTeamRes.decision === "VETO") {
      console.log(`[Red Team Validator] ❌ VETOED! Reasoning: ${redTeamRes.reasoning}`);
      fastResponse.signal = "WAIT";
      fastResponse.riskDecision = "VETOED";
      fastResponse.confidence = Math.max(0, fastResponse.confidence - 25);
      fastResponse.explanation = `VETOED by Red Team: ${redTeamRes.reasoning} | Original Signal: ${result.signal}`;
    } else {
      console.log(`[Red Team Validator] ✅ APPROVED! Reasoning: ${redTeamRes.reasoning}`);
      fastResponse.explanation = `Red Team APPROVED: ${redTeamRes.reasoning} | Original Signal: ${result.signal}`;
    }
  } catch (error: any) {
    console.error("[Red Team Flow Error]", error);
    // Safe-fail: If validator crashes, veto the trade.
    fastResponse.signal = "WAIT";
    fastResponse.riskDecision = "VETOED";
    fastResponse.explanation = `VETOED: Red Team Validator crashed or failed to respond (${error.message}). Safely defaulting to WAIT.`;
  }

  return NextResponse.json(fastResponse);
}
