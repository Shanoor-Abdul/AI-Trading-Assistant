export type AIProvider = "gemini" | "groq" | "openai" | "openrouter";
export type TradingMode = "MANUAL" | "PAPER" | "LIVE";

export type Trend = "Bullish" | "Bearish" | "Sideways";

export type Signal =
  | "BUY"
  | "SELL"
  | "WAIT"
  | "UNSURE"
  | "NO_TRADE";

export type TradeStatus =
  | "SIGNAL_GENERATED"
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_CLOSED"
  | "CLOSED"
  | "WON"
  | "LOST"
  | "REVIEWED"
  | "RISK_REJECTED";

export interface AnalyzeRequest {
  imageBase64?: string;
  symbol?: string;
  timeframe?: string;
  provider: AIProvider;
  model?: string;
  strategy?: string;
  strategyRules?: string;
  marketData?: any;
}

export interface TradingAnalysis {
  trend: Trend;
  signal: Signal;
  confidence: number;
  recommendedTimeframe: string;
  requiredTimeframe?: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward?: number;
  explanation: string;
  marketRegime?: string;

  detectedSymbol?: string;
  detectedTimeframe?: string;

  // New Phase 8 Metadata
  analysisId?: string;
  exchange?: string;
  marketProvider?: string;
  dataTimestamp?: number;
  dataAge?: number;
  primaryTimeframe?: string;
  confirmationTimeframe?: string;
  trendTimeframe?: string;
  riskDecision?: string;

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
  status: TradeStatus;
  
  maxFavorableMove?: number;
  maxAdverseMove?: number;
  slippage?: number;
  fees?: number;
  duration?: number;
  pnl?: number;
  
  screenshotBase64?: string;
  screenshotUrl?: string;
  indicators?: any;
  dbTradeId?: string;
}

export interface AIProviderResponse {
  text: string;
}