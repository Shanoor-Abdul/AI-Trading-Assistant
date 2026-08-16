import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TradeWithAnalysis = {
  id: string;
  status: string;
  pnl: number | null;
  opened_at: string;
  closed_at: string | null;
  analysis?: {
    signal?: string;
    confidence?: number;
    symbol?: string;
    timeframe?: string;
    strategy_version?: string;
    ai_model_version?: string;
    provider_version?: string;
    market_regime?: string;
  } | null;
};

function pct(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function bucketForConfidence(confidence: number) {
  if (confidence >= 80) return "80-100";
  if (confidence >= 60) return "60-79";
  if (confidence >= 40) return "40-59";
  return "0-39";
}

function summarize(rows: TradeWithAnalysis[]) {
  const completed = rows.filter((row) =>
    ["WON", "LOST"].includes(row.status),
  );
  const wins = completed.filter((row) => row.status === "WON");
  const losses = completed.filter((row) => row.status === "LOST");
  const pnlValues = completed.map((row) => Number(row.pnl) || 0);
  const grossProfit = wins.reduce((sum, row) => sum + Math.max(0, Number(row.pnl) || 0), 0);
  const grossLoss = losses.reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.pnl) || 0)), 0);

  return {
    predictions: rows.length,
    completed: completed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: pct(wins.length, completed.length),
    averagePnl: completed.length
      ? Number((pnlValues.reduce((a, b) => a + b, 0) / completed.length).toFixed(6))
      : 0,
    totalPnl: Number(pnlValues.reduce((a, b) => a + b, 0).toFixed(6)),
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? null : 0,
    pending: rows.length - completed.length,
  };
}

function groupBy(rows: TradeWithAnalysis[], key: (row: TradeWithAnalysis) => string) {
  const groups = new Map<string, TradeWithAnalysis[]>();
  for (const row of rows) {
    const value = key(row) || "Unknown";
    const group = groups.get(value) || [];
    group.push(row);
    groups.set(value, group);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([name, group]) => [name, summarize(group)]),
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("trades")
      .select(`
        id,
        status,
        pnl,
        opened_at,
        closed_at,
        analysis:analyses (
          signal,
          confidence,
          symbol,
          timeframe,
          strategy_version,
          ai_model_version,
          provider_version,
          market_regime
        )
      `)
      .eq("user_id", user.id)
      .order("opened_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const rows = (data || []) as unknown as TradeWithAnalysis[];
    const confidenceGroups = new Map<string, TradeWithAnalysis[]>();

    for (const row of rows) {
      const confidence = Number(row.analysis?.confidence) || 0;
      const bucket = bucketForConfidence(confidence);
      const group = confidenceGroups.get(bucket) || [];
      group.push(row);
      confidenceGroups.set(bucket, group);
    }

    const confidenceCalibration = Object.fromEntries(
      ["0-39", "40-59", "60-79", "80-100"].map((bucket) => [
        bucket,
        summarize(confidenceGroups.get(bucket) || []),
      ]),
    );

    return NextResponse.json({
      overall: summarize(rows),
      bySignal: groupBy(rows, (row) => row.analysis?.signal || "Unknown"),
      bySymbol: groupBy(rows, (row) => row.analysis?.symbol || "Unknown"),
      byTimeframe: groupBy(rows, (row) => row.analysis?.timeframe || "Unknown"),
      byStrategy: groupBy(rows, (row) => row.analysis?.strategy_version || "Unknown"),
      byModel: groupBy(rows, (row) => `${row.analysis?.provider_version || "Unknown"}/${row.analysis?.ai_model_version || "Unknown"}`),
      byMarketRegime: groupBy(rows, (row) => row.analysis?.market_regime || "Unknown"),
      confidenceCalibration,
    });
  } catch (error: any) {
    console.error("Performance metrics error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to calculate performance" },
      { status: 500 },
    );
  }
}
