import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: trades, error } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", user.id);

    if (error) throw error;

    const all = trades || [];
    const completed = all.filter((t) => t.status === "WIN" || t.status === "LOSS");
    const wins = completed.filter((t) => t.status === "WIN");
    const losses = completed.filter((t) => t.status === "LOSS");

    const totalSignals = all.length;
    const totalBuys = all.filter((t) => t.direction === "BUY").length;
    const totalSells = all.filter((t) => t.direction === "SELL").length;
    const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;

    const grossProfit = wins.reduce((sum, t) => sum + Math.max(0, Number(t.pnl) || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + Math.min(0, Number(t.pnl) || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    const averageR = completed.length > 0
      ? completed.reduce((sum, t) => sum + (Number(t.pnl_percent) || 0), 0) / completed.length
      : 0;

    let peak = 0;
    let currentBalance = 0;
    let maxDrawdown = 0;
    const sortedTrades = [...completed].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    for (const trade of sortedTrades) {
      currentBalance += Number(trade.pnl) || 0;
      if (currentBalance > peak) peak = currentBalance;
      maxDrawdown = Math.max(maxDrawdown, peak - currentBalance);
    }

    const averageDuration = completed.length > 0
      ? completed.reduce((sum, t) => sum + (Number(t.duration_minutes) || 0), 0) / completed.length
      : 0;

    const byTimeframe = completed.reduce((acc: Record<string, { trades: number; wins: number }>, t) => {
      const tf = t.timeframe || "Unknown";
      acc[tf] ??= { trades: 0, wins: 0 };
      acc[tf].trades += 1;
      if (t.status === "WIN") acc[tf].wins += 1;
      return acc;
    }, {});

    const byRegime = completed.reduce((acc: Record<string, { trades: number; wins: number }>, t) => {
      const regime = t.market_regime || "UNCLEAR";
      acc[regime] ??= { trades: 0, wins: 0 };
      acc[regime].trades += 1;
      if (t.status === "WIN") acc[regime].wins += 1;
      return acc;
    }, {});

    return NextResponse.json({
      metrics: {
        totalSignals,
        breakdown: { BUY: totalBuys, SELL: totalSells },
        completedTrades: completed.length,
        winRate: `${winRate.toFixed(2)}%`,
        precision: `${winRate.toFixed(2)}%`,
        profitFactor: profitFactor.toFixed(2),
        averageR: averageR.toFixed(2),
        maxDrawdown: maxDrawdown.toFixed(2),
        averageDurationMinutes: averageDuration.toFixed(1),
        performanceByTimeframe: byTimeframe,
        performanceByRegime: byRegime,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
