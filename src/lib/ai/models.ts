import { AIProvider } from "../types";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  vision: boolean;
  isFree: boolean;
}

export const AI_MODELS: AIModel[] = [
  // ===========================
  // Gemini
  // ===========================

  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "gemini",
    vision: true,
    isFree: true,
  },

  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    vision: true,
    isFree: true,
  },

  // ===========================
  // Groq
  // ===========================

  {
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    name: "Llama 4 Scout",
    provider: "groq",
    vision: false,
    isFree: true,
  },

  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "groq",
    vision: false,
    isFree: true,
  },

  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    provider: "groq",
    vision: false,
    isFree: true,
  },

  // ===========================
  // OpenAI
  // ===========================

  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    vision: true,
    isFree: false,
  },

  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "openai",
    vision: true,
    isFree: false,
  },

  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    vision: true,
    isFree: false,
  },

  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    vision: true,
    isFree: false,
  },
];

export function getProviderModels(provider: AIProvider) {
  return AI_MODELS.filter((m) => m.provider === provider);
}

export function getModel(id: string) {
  return AI_MODELS.find((m) => m.id === id);
}

export function getDefaultModel(provider: AIProvider) {
  return getProviderModels(provider)[0];
}