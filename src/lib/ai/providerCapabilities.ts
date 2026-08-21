export interface AIProviderCapability {
  vision: boolean;
  structuredOutput: boolean;
  maxImageCount: number;
  maxOutputTokens: number;
}

export function getModelCapabilities(provider: string, model: string): AIProviderCapability {
  const p = provider.toLowerCase();
  const m = (model || "").toLowerCase();

  if (p === "gemini") {
    return { vision: true, structuredOutput: true, maxImageCount: 20, maxOutputTokens: 8192 };
  }

  if (p === "openai") {
    const isVision = m.includes("vision") || m.includes("gpt-4o");
    return { vision: isVision, structuredOutput: true, maxImageCount: 1, maxOutputTokens: 4096 };
  }

  if (p === "groq") {
    const isVision = m.includes("vision");
    return { vision: isVision, structuredOutput: true, maxImageCount: 1, maxOutputTokens: 4096 };
  }

  if (p === "openrouter") {
    // OpenRouter exposes many models through one provider. Keep the capability
    // check model-specific rather than treating every OpenRouter model as vision.
    const isGeminiVision =
      m.includes("google/gemini-2.5-flash") ||
      m.includes("google/gemini-2.5-pro") ||
      m.includes("google/gemini-2.0-flash") ||
      m.includes("google/gemini-1.5");

    const isKnownVisionModel =
      isGeminiVision ||
      m.includes("vision") ||
      m.includes("claude-3") ||
      m.includes("claude-3.5") ||
      m.includes("claude-3.7") ||
      m.includes("gpt-4o") ||
      m.includes("llava") ||
      m.includes("pixtral") ||
      m.includes("qwen-vl") ||
      m.includes("qwen2-vl") ||
      m.includes("qwen2.5-vl");

    return {
      vision: isKnownVisionModel,
      structuredOutput: false,
      maxImageCount: 1,
      maxOutputTokens: 4096,
    };
  }

  return { vision: false, structuredOutput: false, maxImageCount: 0, maxOutputTokens: 2048 };
}
