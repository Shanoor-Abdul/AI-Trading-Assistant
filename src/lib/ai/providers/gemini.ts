import { GoogleGenAI } from "@google/genai";
import { UniversalAIRequest, UniversalAIResponse } from "../schema";
import { buildUniversalPrompt } from "../universalPrompt";
import { buildPriceLevelInstruction } from "../priceLevelPrompt";
import { normalizeResponse } from "../normalizeResponse";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function hasMeaningfulAnalysis(result: UniversalAIResponse): boolean {
  const unified = result.unifiedMarketData as any;
  return Boolean(
    result.marketState?.trim() ||
    result.reasoning?.trim() ||
    result.explanation?.trim() ||
    result.bullishEvidence?.length ||
    result.bearishEvidence?.length ||
    result.invalidationConditions?.length ||
    unified?.currentPrice?.value != null ||
    unified?.completedCandle?.close != null ||
    unified?.currentIncompleteCandle?.close != null ||
    unified?.frameObservations?.length ||
    unified?.supportLevels?.value?.length ||
    unified?.resistanceLevels?.value?.length ||
    (unified?.indicators && Object.keys(unified.indicators).length > 0)
  );
}

export async function analyze(req: UniversalAIRequest): Promise<UniversalAIResponse> {
  const prompt = req.promptOverride || (buildUniversalPrompt(req) + buildPriceLevelInstruction(req));
  const currentModel = req.model || "gemini-3.7-flash";

  try {
    const parts: any[] = [{ text: prompt }];

    if (req.screenshots?.length) {
      for (const shot of req.screenshots) {
        parts.push({ inlineData: { data: shot.base64, mimeType: shot.mimeType } });
      }
    } else if (req.screenshot) {
      parts.push({ inlineData: { data: req.screenshot.base64, mimeType: req.screenshot.mimeType } });
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const retryInstruction = `
The previous response was empty, template-only, or did not contain readable market evidence.
Analyze the supplied chart image(s) now. Do not copy the example JSON defaults.
You MUST populate at least one of marketState, reasoning, explanation, bullishEvidence, bearishEvidence, invalidationConditions, or unifiedMarketData with actual observations.
If the chart is genuinely unreadable, say so explicitly in marketState and reasoning and set confidence/dataConfidence appropriately low.
Return the complete JSON object only.`;

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: attempt === 0
          ? parts
          : [...parts, { text: retryInstruction }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 6000,
        },
      });

      const text = response.text || "";
      if (!text.trim()) {
        if (attempt === 0) continue;
        throw new Error("Gemini returned an empty response after retry.");
      }

      try {
        if (req.rawOutput) {
          const match = text.match(/\{[\s\S]*\}/);
          return (match ? JSON.parse(match[0]) : {}) as any;
        }

        const result = normalizeResponse(text, {
          marketProvider: req.mode === "visual_only" ? "visual_only" : "unknown",
        });

        if (req.isProgressive && !hasMeaningfulAnalysis(result)) {
          if (attempt === 0) {
            console.warn(`[Gemini] Progressive response contained no usable evidence from ${currentModel}; retrying.`);
            continue;
          }
          throw new Error("Gemini returned template-only progressive analysis after retry.");
        }

        return result;
      } catch (error) {
        if (attempt === 0) {
          console.warn(`[Gemini] Invalid JSON/schema from ${currentModel}; retrying once.`);
          continue;
        }
        throw error;
      }
    }

    throw new Error("Gemini analysis failed after retry.");
  } catch (error: any) {
    console.warn(`Gemini model failed: ${currentModel} - ${error.message}`);
    throw error;
  }
}
