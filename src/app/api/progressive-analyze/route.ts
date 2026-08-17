import { NextRequest, NextResponse } from "next/server";
import { POST as analyzePOST } from "@/app/api/analyze/route";

/**
 * Dedicated endpoint for background 20-frame progressive analysis.
 *
 * The final/manual signal continues to use /api/analyze.
 * Keeping this endpoint separate lets progressive analysis evolve independently
 * without changing the manual signal contract.
 *
 * The current implementation deliberately delegates the shared analysis engine
 * to avoid duplicating AI/risk/database logic. The client sends
 * `isProgressive: true` and progressive history exactly as before.
 */
export async function POST(req: NextRequest) {
  try {
    return await analyzePOST(req);
  } catch (error: any) {
    console.error("Progressive Analysis API Error:", error);

    return NextResponse.json(
      {
        error: error?.message || "Progressive analysis failed",
        analysisType: "progressive",
      },
      { status: 500 },
    );
  }
}
