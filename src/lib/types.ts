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
  | "STRONG_BUY"
  | "BUY"
  | "SELL"
  | "STRONG_SELL"
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
  selectedStrategies?: string[];
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
  previousData?: any;
  isProgressive?: boolean;
  progressiveState?: any;
}

export interface TradingAnalysis {
  trend: Trend;
  signal: Signal;
  confidence: number;
  recommendedTimeframe: string;
  requiredTimeframe: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  explanation: string;
  requestedIndicators: string[];
  
  detectedSymbol: string | null;
  detectedTimeframe: string | null;
  exchange: string | null;
  marketProvider: "unknown" | "visual_only" | "ccxt" | "broker_api";
  riskDecision: string;
  reasoning: string;
  dataConfidence: number;

  riskReward?: number;
  marketRegime?: string;
  marketState?: string;
  changesFromPrevious?: string;
  momentum?: string;
  candlestickBehavior?: string;
  indicatorState?: Record<string, string>;
  strategyConsensus?: string;
  strategyConflicts?: string[];

  // Metadata
  analysisId?: string;
  dataTimestamp?: number;
  dataAge?: number;
  primaryTimeframe?: string;
  confirmationTimeframe?: string;
  trendTimeframe?: string;
  tradeDuration?: string;
  
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

export interface ProgressiveAnalysisSummary {
  analysisId: string;
  batchId: number;
  timestamp: string;
  frameStart: number;
  frameEnd: number;
  trend: string;
  momentum: string;
  marketState: string;
  candlestickBehavior: string;
  indicatorState: Record<string, string>;
  strategyConsensus: string;
  strategyConflicts: string[];
  changesFromPrevious: string;
  confidence: number;
}

export interface Observation {
  timestamp: number;
  imageBase64: string;
}

export interface ObservationSessionConfig {
  platform: string;
  symbol: string;
  timeframe: string;
  tradeDuration: string;
  selectedStrategies: string[];
  visibleIndicators: string[];
  marketDataMode: string;
  activeConnectionId: string | null;
  provider: string;
  model: string;
  observationFrequency: number;
}