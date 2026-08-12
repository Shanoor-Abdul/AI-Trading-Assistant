export type AIProvider = "gemini" | "groq" | "openai" | "openrouter";
export type TradingMode = "MANUAL" | "PAPER" | "LIVE";

export interface ExchangeConnection {
  id: string;
  user_id: string;
  exchange: string;
  environment: 'mainnet' | 'testnet';
  api_key: string;
  api_secret?: string;
  api_passphrase?: string;
  is_active: boolean;
  permissions: {
    read: boolean;
    trade: boolean;
    withdraw: boolean;
  };
  created_at: string;
  updated_at: string;
}

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
  | "RISK_REJECTED"
  | "SKIPPED";

export type MarketDataMode = "api" | "visual_only";
export type MarketDataStatus = "available" | "unavailable" | "stale" | "not_requested";

export interface AnalyzeRequest {
  imageBase64?: string;
  symbol?: string;
  timeframe?: string; // Also serves as primaryTimeframe
  provider: AIProvider;
  model?: string;
  strategy?: string;
  strategyRules?: string;
  marketData?: any;
  platform?: string;
  tradeDuration?: string;
  confirmationTimeframe?: string;
  trendTimeframe?: string;
  marketDataMode?: MarketDataMode;
  tradingMode?: TradingMode;
  visibleIndicators?: string[];
  activeConnectionId?: string;
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
  requestedIndicators?: string[];

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
  tradeDuration?: string;
  riskDecision?: string;
  
  marketDataMode?: MarketDataMode;
  marketDataStatus?: MarketDataStatus;

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