export interface AIProviderCapability {
  vision: boolean;
  structuredOutput: boolean;
  maxImageCount: number;
  maxOutputTokens: number;
}

export const PROVIDER_CAPABILITIES: Record<string, AIProviderCapability> = {
  "gemini": {
    vision: true,
    structuredOutput: true,
    maxImageCount: 20,
    maxOutputTokens: 8192
  },
  "openai": {
    vision: true,
    structuredOutput: true,
    maxImageCount: 1, // Let's restrict to 1 for cost/simplicity
    maxOutputTokens: 4096
  },
  "groq": {
    vision: true,
    structuredOutput: true,
    maxImageCount: 1,
    maxOutputTokens: 4096
  },
  "openrouter": {
    vision: true, // depends on model, but we assume true for the vision models we list
    structuredOutput: false, // OpenRouter doesn't uniformly support strict JSON schema
    maxImageCount: 1,
    maxOutputTokens: 4096
  }
};
