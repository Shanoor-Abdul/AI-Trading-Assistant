export type Signal =
  | "STRONG_BUY"
  | "BUY"
  | "WAIT"
  | "UNSURE"
  | "NO_TRADE"
  | "SELL"
  | "STRONG_SELL";

export type TradingAnalysis = {
  trend: "Bullish" | "Bearish" | "Sideways";
  signal: Signal;
  confidence: number;
  recommendedTimeframe: string;
  requiredTimeframe: string | null;
  requestedIndicators: string[];
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  explanation: string;
  reasoning: string;
  detectedSymbol: string;
  detectedTimeframe: string;
  exchange: string;
  marketProvider: string;
  riskDecision: string;
  dataConfidence: number;
  [key: string]: unknown;
};

export type Observation = {
  timestamp: number;
  imageBase64: string;
};

export type MobileConfig = {
  platform: string;
  symbol: string;
  tradeDuration: string;
  primaryTimeframe: string;
  selectedStrategies: string[];
  visibleIndicators: string[];
  selectedProvider: string;
  selectedModel: string;
};
