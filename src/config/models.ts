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
//  {
//     id: "~google/gemini-flash-latest",
//     name: "google",
//     provider: "openrouter",
//     isFree: true,
//   },
//   {
//     id: "qwen/qwen-2-vl-7b-instruct:free",
//     name: "Qwen 2 VL 7B (Best Free)",
//     provider: "openrouter",
//     isFree: true,
//   },
//   {
//     id: "google/gemini-2.0-flash-lite-preview-02-05:free",
//     name: "Gemini Flash Lite (OpenRouter)",
//     provider: "openrouter",
//     isFree: true,
//   },
//   {
//     id: "google/gemma-4-31b-it:free",
//     name: "Gemma 4 31B (OpenRouter)",
//     provider: "openrouter",
//     isFree: true,
//   },
//   {
//     id: "google/gemma-4-26b-a4b-it:free",
//     name: "Gemma 4 26B (OpenRouter)",
//     provider: "openrouter",
//     isFree: true,
//   },
  
//   {
//     id: "openrouter/free",
//     name: "OpenRouter Free Router",
//     provider: "openrouter",
//     isFree: true,
//   },
//   {
//     id: "nvidia/nemotron-nano-12b-v2-vl:free",
//     name: "Nemotron Nano 12B VL",
//     provider: "openrouter",
//     isFree: true,
//   },
//   {
//     id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
//     name: "Nemotron Omni 30B (Vision/Reasoning)",
//     provider: "openrouter",
//     isFree: true,
//   },
//   // These are Text-only models (MUST uncheck "Visual Only" to use these)
//   {
//     id: "google/gemma-4-31b-it:free",
//     name: "Gemma 4 31B (Text Only)",
//     provider: "openrouter",
//     isFree: true,
//   },
//   {
//     id: "nvidia/nemotron-3-ultra-550b-a55b:free",
//     name: "Nemotron Ultra 550B (Text Only)",
//     provider: "openrouter",
//     isFree: true,
//   },

  {
    "id": "openrouter/free",
    "name": "OpenRouter Free Models Router (Auto-selects Vision models)",
    "provider": "openrouter",
    "isFree": true
  },
    {
    id: "google/gemma-4-31b-it:free",
    name: "Gemma 4 31B (Text Only)",
    provider: "openrouter",
    isFree: true,
  },
  {
    "id": "qwen/qwen3.8-27b",
    "name": "Qwen 3.8 27B ",
    "provider": "openrouter",
    "isFree": true
  },
    {
    id: "nvidia/nemotron-nano-12b-v2-vl:free",
    name: "Nemotron Nano 12B VL",
    provider: "openrouter",
    isFree: true,
  },
  {
    id: "poolside/laguna-s-2.1:free",
    name: "poolside/laguna-s-2.1",
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