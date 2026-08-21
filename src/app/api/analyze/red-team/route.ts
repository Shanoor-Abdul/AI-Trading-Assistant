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
    const { proposedSignal, progressive, marketSnapshot, provider, model } = body;

    if (!proposedSignal || !marketSnapshot) {
      return NextResponse.json({ error: "proposedSignal and marketSnapshot are required" }, { status: 400 });
    }

    const evidence = {
      progressiveHistory: progressive,
      currentSnapshot: marketSnapshot,
    };

    const prompt = buildRedTeamPrompt(proposedSignal, evidence);

    const response = await ai.models.generateContent({
      model: model || "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2, // Low temperature for analytical strictness
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Red Team AI returned empty response.");
    }

    // Attempt to parse JSON
    const parsed = JSON.parse(text);
    const validated = RedTeamResponseSchema.parse(parsed);

    return NextResponse.json(validated);
  } catch (error: any) {
    console.error("[Red Team Error]:", error);
    // If the red team fails, default to VETO to fail safely.
    return NextResponse.json({
      decision: "VETO",
      reasoning: `Red Team Validator encountered an error: ${error.message}`,
    });
  }
}
