export type AIProvider = "gemini" | "groq" | "openai" | "openrouter" | "anthropic" | "huggingface";

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

// Models exposed to the image-analysis flows must explicitly declare vision=true.
// Keep isFree for UI/account-tier labeling; it does not mean unlimited inference.
export const AI_MODELS: AIModel[] = [
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (Native)", provider: "anthropic", isFree: false, vision: true },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku (Native)", provider: "anthropic", isFree: false, vision: true },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite (High Rate Limit)", provider: "gemini", isFree: true, vision: true },
  { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "gemini", isFree: true, vision: true },
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "gemini", isFree: true, vision: true },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "gemini", isFree: true, vision: true },
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout Vision + Fast Inference", provider: "groq", isFree: false, vision: true },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "openrouter", isFree: false, vision: true },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openrouter", isFree: false, vision: true },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash", provider: "openrouter", isFree: false, vision: true },
  { id: "openai/gpt-4.1-mini", name: "OpenAI GPT-4.1 Mini", provider: "openrouter", isFree: false, vision: true },
  { id: "openrouter/free", name: "OpenRouter Free Models Router", provider: "openrouter", isFree: true, vision: true },
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", provider: "openrouter", isFree: true, vision: true },
  { id: "qwen/qwen-2-vl-7b-instruct:free", name: "Qwen 2 VL 7B (Free)", provider: "openrouter", isFree: true, vision: true },
  { id: "nvidia/nemotron-nano-12b-v2-vl:free", name: "Nemotron Nano 12B VL", provider: "openrouter", isFree: true, vision: true },
  { id: "stealth/ox-alpha", name: "Stealth OX Alpha (Free)", provider: "openrouter", isFree: true, vision: true },
  { id: "Qwen/Qwen2.5-VL-7B-Instruct", name: "Qwen 2.5 VL 7B (HF Vision)", provider: "huggingface", isFree: true, vision: true },
  { id: "Qwen/Qwen2.5-VL-3B-Instruct", name: "Qwen 2.5 VL 3B (HF Vision)", provider: "huggingface", isFree: true, vision: true },
  { id: "zai-org/GLM-4.5V", name: "GLM-4.5V (HF Vision)", provider: "huggingface", isFree: true, vision: true },
];

export const getModelsByProvider = (provider: AIProvider) =>
  AI_MODELS.filter((model) => model.provider === provider);

export const getVisionModelsByProvider = (provider: AIProvider) =>
  AI_MODELS.filter((model) => model.provider === provider && model.vision);

export const getModelById = (id: string) =>
  AI_MODELS.find((model) => model.id === id);

export const getModelForProvider = (provider: string, model: string) => {
  const normalizedProvider = provider.trim().toLowerCase();
  return AI_MODELS.find(
    (item) => item.id === model && item.provider === normalizedProvider,
  );
};
