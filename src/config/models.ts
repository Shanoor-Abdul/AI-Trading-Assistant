export type AIProvider = "gemini" | "groq" | "openai" | "openrouter";

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
    id: "llama-3.2-90b-vision-preview",
    name: "Llama 3.2 90B Vision",
    provider: "groq",
    isFree: true,
  },

  // OpenRouter (Free Vision Models)
  {
    id: "qwen/qwen-2-vl-7b-instruct:free",
    name: "Qwen 2 VL 7B (Best Free)",
    provider: "openrouter",
    isFree: true,
  },
  {
    id: "google/gemini-2.0-flash-lite-preview-02-05:free",
    name: "Gemini Flash Lite (OpenRouter)",
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
    id: "openrouter/free",
    name: "OpenRouter Free Router",
    provider: "openrouter",
    isFree: true,
  },

  // OpenAI (Paid / Credits Required)
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", isFree: false },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", isFree: false },
  {
    id: "gpt-4.5-preview",
    name: "GPT-4.5 Preview",
    provider: "openai",
    isFree: false,
  },
  { id: "o1-mini", name: "o1 Mini", provider: "openai", isFree: false },
  { id: "o1-preview", name: "o1 Preview", provider: "openai", isFree: false },
];

export const getModelsByProvider = (provider: AIProvider) => {
  return AI_MODELS.filter((model) => model.provider === provider);
};

export const getModelById = (id: string) => {
  return AI_MODELS.find((model) => model.id === id);
};
