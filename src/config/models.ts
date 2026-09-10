export type AIProvider = "anthropic" | "openrouter" | "gemini" | "groq" | "openai" | "huggingface";

export const AI_REQUEST_CONFIG = {
  maxOutputTokens: 6000,
};

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  isFree: boolean;
  vision: boolean;
}

export const AI_MODELS: AIModel[] = [
  // ==========================================
  // Anthropic Claude (Native API)
  // ==========================================
  {
    id: "claude-sonnet-5",
    name: "Claude 5 Sonnet",
    provider: "anthropic",
    isFree: false,
    vision: true,
  },
  {
    id: "claude-opus-5",
    name: "Claude 5 Opus",
    provider: "anthropic",
    isFree: false,
    vision: true,
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude 4.5 Haiku",
    provider: "anthropic",
    isFree: false,
    vision: true,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    isFree: false,
    vision: true,
  },

  // ==========================================
  // OpenRouter (100% Free Models)
  // ==========================================
  {
    id: "openrouter/free",
    name: "OpenRouter Free Models Router",
    provider: "openrouter",
    isFree: true,
    vision: false,
  },
  {
    id: "google/gemini-2.0-flash-lite-preview-02-05:free",
    name: "Gemini 2.0 Flash Lite (Free)",
    provider: "openrouter",
    isFree: true,
    vision: true,
  },
  {
    id: "meta-llama/llama-3-8b-instruct:free",
    name: "Llama 3 8B (Free)",
    provider: "openrouter",
    isFree: true,
    vision: true,
  },
  {
    id: "qwen/qwen-2-7b-instruct:free",
    name: "Qwen 2 7B (Free)",
    provider: "openrouter",
    isFree: true,
    vision: true,
  },
  {
    id: "nvidia/nemotron-nano-12b-v2-vl:free",
    name: "Nemotron Nano 12B VL (Free)",
    provider: "openrouter",
    isFree: true,
    vision: true,
  },
  {
    id: "google/gemma-4-31b-it:free",
    name: "Gemma 4 31B (Free)",
    provider: "openrouter",
    isFree: true,
    vision: false,
  }
];

export const getModelsByProvider = (provider: AIProvider) =>
  AI_MODELS.filter((model) => model.provider === provider);

export const getModelById = (id: string) =>
  AI_MODELS.find((model) => model.id === id);

