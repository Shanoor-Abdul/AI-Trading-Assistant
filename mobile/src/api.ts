import type { MobileConfig, Observation, TradingAnalysis } from "./types";

const API_BASE_URL = "https://ai-all-trading-assistant.vercel.app";

export async function analyzeMobileObservations(
  config: MobileConfig,
  observations: Observation[],
  previousAnalysis: TradingAnalysis | null,
): Promise<TradingAnalysis> {
  if (observations.length === 0) throw new Error("No screen observations available.");

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: config.symbol.trim().toUpperCase(),
      timeframe: config.primaryTimeframe,
      platform: config.platform,
      tradeDuration: config.tradeDuration,
      provider: config.selectedProvider,
      model: config.selectedModel,
      selectedStrategies: config.selectedStrategies,
      visibleIndicators: config.visibleIndicators,
      marketDataMode: "visual_only",
      screenshots: observations.map((observation) => ({
        timestamp: new Date(observation.timestamp).toISOString(),
        mimeType: "image/jpeg",
        base64: observation.imageBase64,
      })),
      previousData: previousAnalysis ?? undefined,
      progressiveState: previousAnalysis ? [previousAnalysis] : [],
      isProgressive: false,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Analysis request failed (${response.status}).`);
  }

  return (await response.json()) as TradingAnalysis;
}
