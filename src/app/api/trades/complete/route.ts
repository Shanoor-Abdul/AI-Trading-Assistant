import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { symbol, timeframe, direction, entry_price, exit_price, stop_loss, take_profit, status, pnl, pnl_percent, duration_minutes, confidence, signal_quality, market_regime, notes } = body;
    const finalNotes = body.engineMetrics ? `[VERSION: ${body.engineMetrics.engineVersion} | PROMPT: ${body.engineMetrics.promptVersion} | MODE: ${body.engineMetrics.validationMode}]\n\n${notes || ""}` : notes;
    const { data: trade, error } = await supabase.from("trades").insert({ user_id: user.id, symbol, timeframe, direction, entry_price, exit_price, stop_loss, take_profit, status: status || "CLOSED", pnl, pnl_percent, duration_minutes, confidence, signal_quality, market_regime, notes: finalNotes }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, trade });
  } catch (error: any) {
    console.error("[Trades Complete] Internal error:", error);
    return NextResponse.json({ error: "Failed to save completed trade" }, { status: 500 });
  }
}
