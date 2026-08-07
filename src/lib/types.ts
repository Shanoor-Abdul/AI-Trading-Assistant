export type AIProvider = "gemini" | "groq" | "openai" | "openrouter";

export type Trend =
  | "Bullish"
  | "Bearish"
  | "Sideways";

export type Signal =
  | "BUY"
  | "SELL"
  | "WAIT"
  | "UNSURE";

export interface AnalyzeRequest {
  imageBase64: string;
  symbol?: string;
  timeframe?: string;
  provider: AIProvider;
  model?: string;
  marketData?: any;
}

export interface TradingAnalysis {
  trend: Trend;

  signal: Signal;

  confidence: number;

  recommendedTimeframe: string;

  entryPrice: number | null;

  stopLoss: number | null;

  takeProfit: number | null;

  explanation: string;

  detectedSymbol?: string;

  detectedTimeframe?: string;

  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
}

export interface TradeHistoryEntry extends TradingAnalysis {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  status: "OPEN" | "WON" | "LOST" | "CLOSED";
  maxFavorableMove?: number;
  maxAdverseMove?: number;
  screenshotBase64?: string;
  indicators?: any;
}

export interface AIProviderResponse {
  text: string;
}