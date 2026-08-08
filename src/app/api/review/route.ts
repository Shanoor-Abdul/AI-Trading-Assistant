import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

const AIReviewSchema = z.object({
  predictionQuality: z.string(),
  whatWasCorrect: z.string(),
  whatWasWrong: z.string(),
  missedSignals: z.string(),
  improvementSuggestions: z.string(),
  reviewConfidence: z.number().min(0).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const { tradeId, finalStatus, pnl, maxFavorableMove, maxAdverseMove } = await req.json();

    if (!tradeId) {
      return NextResponse.json({ error: "tradeId is required" }, { status: 400 });
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    // 1. Update the trade in DB first
    if (finalStatus) {
      await supabase.from("trades").update({
        status: finalStatus,
        pnl: pnl || 0,
        max_favorable_move: maxFavorableMove || 0,
        max_adverse_move: maxAdverseMove || 0,
        closed_at: new Date().toISOString()
      }).eq("id", tradeId);
    }

    // 2. Fetch Trade and Analysis
    const { data: trade, error: tradeErr } = await supabase
      .from("trades")
      .select(`
        *,
        analysis: analyses (*)
      `)
      .eq("id", tradeId)
      .single();

    if (tradeErr || !trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (trade.status === "REVIEWED") {
      return NextResponse.json({ error: "Trade already reviewed" }, { status: 400 });
    }

    if (trade.status !== "CLOSED" && trade.status !== "WON" && trade.status !== "LOST") {
      return NextResponse.json({ error: "Trade must be CLOSED to review" }, { status: 400 });
    }

    const analysis = trade.analysis;

    // 2. Formulate Prompt
    const prompt = `
You are an expert AI Trading Coach. Review this completed trade.

--- ORIGINAL SETUP ---
Symbol: ${analysis.symbol}
Timeframe: ${analysis.timeframe}
Strategy: ${analysis.strategy_version}
Signal Generated: ${analysis.signal}
Entry: ${trade.entry_price}
Take Profit: ${trade.take_profit}
Stop Loss: ${trade.stop_loss}
Original Reasoning: ${analysis.reason}

--- ACTUAL OUTCOME ---
Status: ${trade.status}
PnL: ${trade.pnl || "Unknown"}
Max Favorable Move: ${trade.max_favorable_move || 0}
Max Adverse Move: ${trade.max_adverse_move || 0}
Duration: ${trade.duration || 0} seconds

Based on this outcome, analyze what went wrong (or right). Did the AI miss a higher timeframe trend? Was the stop loss too tight?

You must respond in strict JSON matching this schema:
{
  "predictionQuality": "String (Excellent, Good, Poor, Terrible)",
  "whatWasCorrect": "String (e.g. Trend direction was correct)",
  "whatWasWrong": "String (e.g. Stop loss was too tight)",
  "missedSignals": "String (e.g. Missed the 1h bearish divergence)",
  "improvementSuggestions": "String (e.g. Wait for 15m confirmation next time)",
  "reviewConfidence": Number (0-100)
}
`;

    // 3. Call AI
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: prompt,
    });

    // 4. Parse & Validate
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI Review response");
    
    const parsed = JSON.parse(jsonMatch[0].replace(/\\n/g, "\\\\n"));
    const reviewData = AIReviewSchema.parse(parsed);

    // 5. Save to DB
    const { data: review, error: insertErr } = await supabase.from("ai_reviews").insert({
      trade_id: trade.id,
      prediction_quality: reviewData.predictionQuality,
      what_was_correct: reviewData.whatWasCorrect,
      what_was_wrong: reviewData.whatWasWrong,
      missed_signals: reviewData.missedSignals,
      improvement_suggestions: reviewData.improvementSuggestions,
      review_confidence: reviewData.reviewConfidence,
    }).select().single();

    if (insertErr) throw insertErr;

    // 6. Mark trade as REVIEWED
    await supabase.from("trades").update({ status: "REVIEWED" }).eq("id", trade.id);

    return NextResponse.json({ success: true, review });

  } catch (error: any) {
    console.error("AI Review Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate review" }, { status: 500 });
  }
}
