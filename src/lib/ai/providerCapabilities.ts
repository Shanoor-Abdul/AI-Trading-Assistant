import { getModelById, getModelForProvider } from "@/config/models";

export interface AIProviderCapability {
  vision: boolean;
  structuredOutput: boolean;
  maxImageCount: number;
  maxOutputTokens: number;
}

export function getModelCapabilities(
  provider: string,
  model: string,
): AIProviderCapability | null {
  const p = provider.trim().toLowerCase();
  const configuredModel = model ? getModelById(model) : undefined;

  // When a model is in the central registry, the provider must match exactly.
  // This prevents requests such as provider=huggingface + an OpenRouter model
  // from reaching the wrong adapter while preserving fallback support for
  // provider-native/custom models that are not registered here.
  if (configuredModel && configuredModel.provider !== p) {
    return null;
  }

  // The model registry is the single source of truth for vision support.
  // Unknown models remain subject to provider-native capability checks below.
  if (configuredModel) {
    return {
      vision: configuredModel.vision,
      structuredOutput: p === "openrouter" ? false : true,
      maxImageCount: configuredModel.vision ? 20 : 0,
      maxOutputTokens: p === "gemini" ? 8192 : 4096,
    };
  }

  // Preserve provider-native fallback behavior for custom/unregistered models.
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

  if (p === "openrouter") {
    // Unknown OpenRouter models are deliberately not assumed to support vision.
    return {
      vision: false,
      structuredOutput: false,
      maxImageCount: 0,
      maxOutputTokens: 2048,
    };
  }

  if (p === "huggingface") {
    // Unknown HF models are deliberately not assumed to support vision.
    return {
      vision: false,
      structuredOutput: false,
      maxImageCount: 0,
      maxOutputTokens: 2048,
    };
  }

  if (p === "anthropic") {
    const vision = m.includes("claude");
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

export function isConfiguredVisionModel(provider: string, model: string): boolean {
  return Boolean(getModelForProvider(provider, model)?.vision);
}
