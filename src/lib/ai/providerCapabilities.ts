

export interface AIProviderCapability {
  vision: boolean;
  structuredOutput: boolean;
  maxImageCount: number;
  maxOutputTokens: number;
}

export function getModelCapabilities(provider: string, model: string): AIProviderCapability {
  const p = provider.toLowerCase();
  const m = (model || "").toLowerCase();

  if (p === "gemini") {
    return { vision: true, structuredOutput: true, maxImageCount: 20, maxOutputTokens: 8192 };
  }
  
  if (p === "openai") {
    const isVision = m.includes("vision") || m.includes("gpt-4o");
    return { vision: isVision, structuredOutput: true, maxImageCount: 1, maxOutputTokens: 4096 };
  }
  
  if (p === "groq") {
    const isVision = m.includes("vision");
    return { vision: isVision, structuredOutput: true, maxImageCount: 1, maxOutputTokens: 4096 };
  }
  
  if (p === "openrouter") {
    // OpenRouter models with vision capabilities
    const isVision = m.includes("vision") || m.includes("claude-3") || m.includes("gpt-4o") || m.includes("llava") || m.includes("pixtral") || m.includes("qwen-vl");
    return { 
      vision: isVision, 
      structuredOutput: false, 
      maxImageCount: 1, 
      maxOutputTokens: 4096 
    };
  }

  // Safe fallback
  return { vision: false, structuredOutput: false, maxImageCount: 0, maxOutputTokens: 2048 };
}
