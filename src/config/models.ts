export type AIProvider = "gemini" | "groq" | "openai" | "openrouter";

export const AI_REQUEST_CONFIG = {
  maxOutputTokens: 1200,
};

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  isFree: boolean;
}

export const AI_MODELS: AIModel[] = [
   {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openrouter",
    isFree: false,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "google/gemini-2.5",
    provider: "openrouter",
    isFree: false,
  },
  {
    id: "openai/gpt-4.1-mini",
    name: "openai/gpt-4.1-mini",
    provider: "openrouter",
    isFree: false,
  },
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant — Fast Signal",
    provider: "groq",
    isFree: false,
  },
  {
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    name: "Llama 4 Scout — Vision + Fast Inference",
    provider: "groq",
    isFree: false,
  },
  {
    id: "openrouter/free",
    name: "OpenRouter Free Models Router",
    provider: "openrouter",
    isFree: true,
  },
  {
    id: "google/gemma-4-31b-it:free",
    name: "Gemma 4 31B (Text Only)",
    provider: "openrouter",
    isFree: true,
  },
  {
    id: "qwen/qwen3.8-27b",
    name: "Qwen 3.8 27B",
    provider: "openrouter",
    isFree: true,
  },
  {
    id: "nvidia/nemotron-nano-12b-v2-vl:free",
    name: "Nemotron Nano 12B VL",
    provider: "openrouter",
    isFree: true,
  },
  {
    id: "poolside/laguna-s-2.1:free",
    name: "Poolside Laguna S 2.1",
    provider: "openrouter",
    isFree: true,
  },
];

export const getModelsByProvider = (provider: AIProvider) =>
  AI_MODELS.filter((model) => model.provider === provider);

export const getModelById = (id: string) =>
  AI_MODELS.find((model) => model.id === id);
