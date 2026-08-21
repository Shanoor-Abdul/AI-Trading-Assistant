import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildRedTeamPrompt } from "@/lib/ai/redTeamPrompt";
import { z } from "zod";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const RedTeamResponseSchema = z.object({
  decision: z.enum(["VETO", "PASS"]),
  reasoning: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { proposedSignal, progressive, marketSnapshot, model } = body;
    if (!proposedSignal || !marketSnapshot) return NextResponse.json({ error: "proposedSignal and marketSnapshot are required" }, { status: 400 });
    const prompt = buildRedTeamPrompt(proposedSignal, { progressiveHistory: progressive, currentSnapshot: marketSnapshot });
    const response = await ai.models.generateContent({
      model: model || "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.2, responseMimeType: "application/json" },
    });
    const text = response.text;
    if (!text) throw new Error("Red Team AI returned empty response.");
    return NextResponse.json(RedTeamResponseSchema.parse(JSON.parse(text)));
  } catch (error: any) {
    console.error("[Red Team Error]:", error);
    return NextResponse.json({ decision: "VETO", reasoning: `Red Team Validator encountered an error: ${error.message}` });
  }
}
