import { getModelById, getModelForProvider } from "@/config/models";

export interface AIProviderCapability {
  vision: boolean;
  structuredOutput: boolean;
  maxImageCount: number;
  maxOutputTokens: number;
}

const UNSUPPORTED_CAPABILITY: AIProviderCapability = {
  vision: false,
  structuredOutput: false,
  maxImageCount: 0,
  maxOutputTokens: 2048,
};

export function getModelCapabilities(
  provider: string,
  model: string,
): AIProviderCapability {
  const p = provider.trim().toLowerCase();
  const configuredModel = model ? getModelById(model) : undefined;

  // When a model is in the central registry, the provider must match exactly.
  // Return a non-vision capability instead of throwing so existing callers keep
  // the same return type and the mobile route rejects the request before any AI call.
  if (configuredModel && configuredModel.provider !== p) {
    return UNSUPPORTED_CAPABILITY;
  }

  // The model registry is the single source of truth for configured vision support.
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

  // Unknown OpenRouter/Hugging Face models are deliberately not assumed to
  // support vision. Registered vision models are handled above.
  if (p === "openrouter" || p === "huggingface") {
    return UNSUPPORTED_CAPABILITY;
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

  return UNSUPPORTED_CAPABILITY;
}

export function isConfiguredVisionModel(provider: string, model: string): boolean {
  return Boolean(getModelForProvider(provider, model)?.vision);
}
