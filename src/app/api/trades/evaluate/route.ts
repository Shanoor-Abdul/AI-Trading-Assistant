import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TradeRow = {
  id: string;
  user_id: string;
  analysis_id: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  position_size: number | null;
  status: string;
  opened_at: string;
  analysis?: {
    signal?: string;
    symbol?: string;
    timeframe?: string;
  } | null;
};

function calculatePnl(signal: string, entry: number, exit: number, size: number) {
  if (signal === "SELL" || signal === "STRONG_SELL") {
    return (entry - exit) * size;
  }
  return (exit - entry) * size;
}

function isTerminal(status: string) {
  return ["WON", "LOST", "CLOSED", "REVIEWED"].includes(status);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const tradeId = body.tradeId as string | undefined;
    const currentPrice = Number(body.currentPrice);
    const forceClose = body.forceClose === true;

    if (!tradeId || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      return NextResponse.json(
        { error: "tradeId and a positive currentPrice are required" },
        { status: 400 },
      );
    }

    const { data: trade, error } = await supabase
      .from("trades")
      .select(`
        id,
        user_id,
        analysis_id,
        entry_price,
        stop_loss,
        take_profit,
        position_size,
        status,
        opened_at,
        analysis:analyses (
          signal,
          symbol,
          timeframe
        )
      `)
      .eq("id", tradeId)
      .eq("user_id", user.id)
      .single();

    if (error || !trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const row = trade as unknown as TradeRow;

    if (isTerminal(row.status)) {
      return NextResponse.json({
        success: true,
        alreadyClosed: true,
        trade: row,
      });
    }

    const signal = row.analysis?.signal || "";
    const entry = Number(row.entry_price);
    const stopLoss = Number(row.stop_loss);
    const takeProfit = Number(row.take_profit);
    const positionSize = Number(row.position_size) || 1;

    if (!Number.isFinite(entry) || entry <= 0) {
      return NextResponse.json({ error: "Trade has no valid entry price" }, { status: 400 });
    }

    const isBuy = signal === "BUY" || signal === "STRONG_BUY";
    const isSell = signal === "SELL" || signal === "STRONG_SELL";

    if (!isBuy && !isSell) {
      return NextResponse.json({ error: "Trade signal is not evaluable" }, { status: 400 });
    }

    const hitTakeProfit = Number.isFinite(takeProfit) && takeProfit > 0 &&
      (isBuy ? currentPrice >= takeProfit : currentPrice <= takeProfit);
    const hitStopLoss = Number.isFinite(stopLoss) && stopLoss > 0 &&
      (isBuy ? currentPrice <= stopLoss : currentPrice >= stopLoss);

    // When a single observed price crosses both levels, use the stop first as
    // the conservative outcome because the exact intrabar path is unknown.
    let finalStatus: "WON" | "LOST" | "CLOSED" | null = null;
    let exitPrice = currentPrice;

    if (hitStopLoss) {
      finalStatus = "LOST";
      exitPrice = stopLoss;
    } else if (hitTakeProfit) {
      finalStatus = "WON";
      exitPrice = takeProfit;
    } else if (forceClose) {
      finalStatus = calculatePnl(signal, entry, currentPrice, 1) >= 0 ? "WON" : "LOST";
    }

    if (!finalStatus) {
      const unrealizedPnl = calculatePnl(signal, entry, currentPrice, positionSize);
      return NextResponse.json({
        success: true,
        closed: false,
        status: row.status,
        currentPrice,
        unrealizedPnl,
      });
    }

    const pnl = calculatePnl(signal, entry, exitPrice, positionSize);
    const openedAt = new Date(row.opened_at).getTime();
    const duration = Number.isFinite(openedAt)
      ? Math.max(0, Date.now() - openedAt)
      : null;

    const { data: updatedTrade, error: updateError } = await supabase
      .from("trades")
      .update({
        status: finalStatus,
        pnl,
        closed_at: new Date().toISOString(),
        max_favorable_move: Math.max(0, pnl),
        max_adverse_move: Math.min(0, pnl),
      })
      .eq("id", tradeId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      closed: true,
      status: finalStatus,
      exitPrice,
      pnl,
      duration,
      trade: updatedTrade,
    });
  } catch (error: any) {
    console.error("Trade evaluation error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to evaluate trade" },
      { status: 500 },
    );
  }
}
