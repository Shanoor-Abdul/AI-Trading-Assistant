export type AIProvider = "gemini" | "groq" | "openai" | "openrouter";

export const AI_REQUEST_CONFIG = {
  maxOutputTokens: 3000,
};

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  isFree: boolean;
}

export const AI_MODELS: AIModel[] = [
  // Google Gemini (Free Tier)
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "gemini",
    isFree: true,
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    provider: "gemini",
    isFree: true,
  },

  // Groq (Free Tier)
  {
    id: "qwen/qwen3.6-27b",
    name: "Qwen 3.6 27B Vision",
    provider: "groq",
    isFree: true,
  },

  // OpenRouter (Free Vision Models)
  {
    id: "qwen/qwen-2-vl-7b-instruct:free",
    name: "Qwen 2 VL 7B (Best Free Vision)",
    provider: "openrouter",
    isFree: true,
  },
  {
    id: "nvidia/nemotron-nano-12b-v2-vl:free",
    name: "Nemotron Nano 12B VL",
    provider: "openrouter",
    isFree: true,
  },
];

export const getModelsByProvider = (provider: AIProvider) => {
  return AI_MODELS.filter((model) => model.provider === provider);
};

export const getModelById = (id: string) => {
  return AI_MODELS.find((model) => model.id === id);
};
