import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch trades joined with analyses
    const { data: trades, error } = await supabase
      .from("trades")
      .select(`
        *,
        analysis:analyses (
          symbol,
          timeframe,
          signal,
          confidence,
          reason,
          screenshot_url,
          market_provider,
          exchange,
          risk_decision
        )
      `)
      .eq("user_id", user.id)
      .order("opened_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Fetch trades error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to TradeHistoryEntry format
    const formattedTrades = trades.map((t: any) => ({
      id: t.id,
      timestamp: new Date(t.opened_at).getTime(),
      symbol: t.analysis?.symbol || "-",
      timeframe: t.analysis?.timeframe || "-",
      trend: "Unknown", 
      signal: t.analysis?.signal || "-",
      confidence: t.analysis?.confidence || 0,
      recommendedTimeframe: t.analysis?.timeframe,
      entryPrice: t.entry_price,
      stopLoss: t.stop_loss,
      takeProfit: t.take_profit,
      explanation: t.analysis?.reason || "",
      status: t.status,
      open: null,
      high: null,
      low: null,
      close: null,
      screenshotBase64: t.analysis?.screenshot_url,
      dbTradeId: t.id,
      exchange: t.analysis?.exchange,
      marketProvider: t.analysis?.market_provider,
      riskDecision: t.analysis?.risk_decision,
    }));

    return NextResponse.json({ trades: formattedTrades });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ids, all } = await req.json();

    if (all) {
      // Delete all trades for user
      const { error } = await supabase
        .from("trades")
        .delete()
        .eq("user_id", user.id);
      
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Delete specific trades
      const { error } = await supabase
        .from("trades")
        .delete()
        .in("id", ids)
        .eq("user_id", user.id);
      
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
