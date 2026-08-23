import { getModelById } from "@/config/models";

export interface AIProviderCapability {
  vision: boolean;
  structuredOutput: boolean;
  maxImageCount: number;
  maxOutputTokens: number;
}

export function getModelCapabilities(
  provider: string,
  model: string,
): AIProviderCapability {
  const p = provider.toLowerCase();
  const configuredModel = getModelById(model);

  // The model registry is the single source of truth for vision support.
  // Unknown models remain non-vision instead of being guessed as vision-capable.
  if (configuredModel && configuredModel.provider === p) {
    return {
      vision: configuredModel.vision,
      structuredOutput: p === "openrouter" ? false : true,
      maxImageCount: configuredModel.vision ? 20 : 0,
      maxOutputTokens: p === "gemini" ? 8192 : 4096,
    };
  }

  // Keep provider-native fallback behavior for models not represented in the
  // central registry. This preserves existing Gemini/OpenAI/Groq behavior while
  // preventing unknown OpenRouter models from being treated as vision-capable.
  const m = (model || "").toLowerCase();

  if (p === "gemini") {
    return {
      vision: true,
      structuredOutput: true,
      maxImageCount: 20,
      maxOutputTokens: 8192,
    };
  }

  if (p === "openai") {
    const vision = m.includes("vision") || m.includes("gpt-4o") || m.includes("gpt-4.1");
    return {
      vision,
      structuredOutput: true,
      maxImageCount: vision ? 20 : 0,
      maxOutputTokens: 4096,
    };
  }

  if (p === "groq") {
    const vision = m.includes("vision") || m.includes("llama-4-scout");
    return {
      vision,
      structuredOutput: true,
      maxImageCount: vision ? 20 : 0,
      maxOutputTokens: 4096,
    };
  }

  return {
    vision: false,
    structuredOutput: false,
    maxImageCount: 0,
    maxOutputTokens: 2048,
  };
}
