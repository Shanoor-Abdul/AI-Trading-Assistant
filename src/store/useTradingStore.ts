import { create } from 'zustand';
import { TradeHistoryEntry } from '@/lib/types';

export interface TradingState {
  isAnalyzing: boolean;
  setIsAnalyzing: (val: boolean) => void;
  symbol: string;
  setSymbol: (val: string) => void;
  timeframe: string;
  setTimeframe: (val: string) => void;
  stream: MediaStream | null;
  setStream: (stream: MediaStream | null) => void;
  lastImageBase64: string | null;
  setLastImageBase64: (val: string | null) => void;
  isFetchingAnalysis: boolean;
  setIsFetchingAnalysis: (val: boolean) => void;
  isAutoScan: boolean;
  setIsAutoScan: (val: boolean) => void;
  // Analysis results
  trend: "Bullish" | "Bearish" | "Sideways" | null;
  signal: "BUY" | "SELL" | "WAIT" | "UNSURE" | null;
  confidence: number; // 0-100
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  recommendedTimeframe: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  explanation: string;
  capital: number;
  setCapital: (val: number) => void;
  riskPercent: number;
  setRiskPercent: (val: number) => void;
  selectedProvider: string;
  selectedModel: string;
  setSelectedModel: (provider: string, model: string) => void;
  strategy: string;
  setStrategy: (val: string) => void;
  tradingMode: "MANUAL" | "PAPER" | "LIVE";
  setTradingMode: (val: "MANUAL" | "PAPER" | "LIVE") => void;
  apiFailCount: number;
  incrementFailCount: () => void;
  resetFailCount: () => void;
  updateAnalysis: (data: Partial<TradingState>) => void;
  
  tradeHistory: TradeHistoryEntry[];
  clearAnalysis: () => void;
}

export const useTradingStore = create<TradingState>((set, get) => ({
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),
  symbol: "BTC/USDT",
  setSymbol: (val) => set({ symbol: val }),
  timeframe: "5m",
  setTimeframe: (val) => set({ timeframe: val }),
  stream: null,
  setStream: (stream) => set({ stream }),
  lastImageBase64: null,
  setLastImageBase64: (val) => set({ lastImageBase64: val }),
  isFetchingAnalysis: false,
  setIsFetchingAnalysis: (val) => set({ isFetchingAnalysis: val }),
  isAutoScan: false,
  setIsAutoScan: (val) => set({ isAutoScan: val }),
  trend: null,
  signal: null,
  confidence: 0,
  entryPrice: null,
  stopLoss: null,
  takeProfit: null,
  recommendedTimeframe: null,
  open: null,
  high: null,
  low: null,
  close: null,
  explanation: "",
  capital: 1000,
  setCapital: (val) => set({ capital: val }),
  riskPercent: 1,
  setRiskPercent: (val) => set({ riskPercent: val }),
  selectedProvider: "gemini",
  selectedModel: "gemini-2.5-flash",
  setSelectedModel: (provider, model) => set({ selectedProvider: provider, selectedModel: model, apiFailCount: 0 }),
  strategy: "Trend Following",
  setStrategy: (val) => set({ strategy: val }),
  tradingMode: "MANUAL",
  setTradingMode: (val) => set({ tradingMode: val }),
  apiFailCount: 0,
  incrementFailCount: () => set((state) => ({ apiFailCount: state.apiFailCount + 1 })),
  resetFailCount: () => set({ apiFailCount: 0 }),
  
  tradeHistory: [],
  clearAnalysis: () => set({
    trend: null,
    signal: null,
    confidence: 0,
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    recommendedTimeframe: null,
    open: null,
    high: null,
    low: null,
    close: null,
    explanation: "",
  }),

  updateAnalysis: (data) => set((state) => {
    const newState = { ...state, ...data };
    
    // If it's a valid completed analysis, add it to history
    if (data.signal && data.signal !== "UNSURE" && newState.trend && newState.signal) {
      const historyEntry: TradeHistoryEntry = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        symbol: newState.symbol,
        timeframe: newState.timeframe,
        trend: newState.trend,
        signal: newState.signal,
        confidence: newState.confidence,
        recommendedTimeframe: newState.recommendedTimeframe || newState.timeframe,
        entryPrice: newState.entryPrice,
        stopLoss: newState.stopLoss,
        takeProfit: newState.takeProfit,
        explanation: newState.explanation,
        open: newState.open || null,
        high: newState.high || null,
        low: newState.low || null,
        close: newState.close || null,
        status: (newState.signal === "WAIT" || newState.signal === "NO_TRADE") ? "SKIPPED" : "OPEN",
        screenshotBase64: newState.lastImageBase64 || undefined,
        dbTradeId: (data as any).dbTradeId, // Save the database UUID for reviews
      };
      
      newState.tradeHistory = [historyEntry, ...state.tradeHistory];
    }
    
    return newState;
  }),
}));
