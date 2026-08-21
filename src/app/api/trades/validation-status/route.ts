import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEngineConfigMetrics } from "@/lib/engines/EngineVersion";

<<<<<<< HEAD
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
=======
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

>>>>>>> feature/ai-signal-accuracy2
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const metrics = getEngineConfigMetrics();
    const versionString = `[VERSION: ${metrics.engineVersion}`;

    const { data: trades, error } = await supabase
      .from("trades")
<<<<<<< HEAD
      .select("id, status, pnl")
=======
      .select("id, status, pnl, notes")
>>>>>>> feature/ai-signal-accuracy2
      .eq("user_id", user.id)
      .like("notes", `%${versionString}%`);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

<<<<<<< HEAD
    const completedTrades = trades?.filter(t => t.status === "WIN" || t.status === "LOSS") || [];
    const sampleSize = completedTrades.length;
    const wins = completedTrades.filter(t => t.status === "WIN").length;
    const winRate = sampleSize > 0 ? wins / sampleSize : 0;
    
    // Meaningful sample size threshold from Phase 5 logic
=======
    const completedTrades = (trades || []).filter(
      (t) => t.status === "WIN" || t.status === "LOSS",
    );
    const sampleSize = completedTrades.length;
    const wins = completedTrades.filter((t) => t.status === "WIN").length;
    const winRate = sampleSize > 0 ? wins / sampleSize : 0;
>>>>>>> feature/ai-signal-accuracy2
    const MINIMUM_SAMPLE_SIZE = 30;
    const isStatisticallySignificant = sampleSize >= MINIMUM_SAMPLE_SIZE;

    return NextResponse.json({
      engineVersion: metrics.engineVersion,
      sampleSize,
      wins,
      winRate,
      isStatisticallySignificant,
<<<<<<< HEAD
      warning: !isStatisticallySignificant 
        ? `Insufficient sample size (${sampleSize}/${MINIMUM_SAMPLE_SIZE}). Do not declare the system high-precision until minimum forward paper-trading threshold is met.` 
        : "Sample size threshold met. Validation performance can be evaluated."
=======
      warning: !isStatisticallySignificant
        ? `Insufficient sample size (${sampleSize}/${MINIMUM_SAMPLE_SIZE}). Do not declare the system high-precision until minimum forward paper-trading threshold is met.`
        : "Sample size threshold met. Validation performance can be evaluated.",
>>>>>>> feature/ai-signal-accuracy2
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch validation status" }, { status: 500 });
  }
}
<<<<<<< HEAD

=======
>>>>>>> feature/ai-signal-accuracy2
