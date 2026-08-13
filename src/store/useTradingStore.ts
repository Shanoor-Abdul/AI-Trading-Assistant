import { create } from 'zustand';
import { TradeHistoryEntry, ProgressiveAnalysisSummary, Observation } from '@/lib/types';
import { calculateMaxObservationFrames } from '@/lib/observation/calculation';

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
  signal: "BUY" | "SELL" | "WAIT" | "UNSURE" | "NO_TRADE" | null;
  confidence: number; // 0-100
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  recommendedTimeframe: string | null;
  requestedIndicators: string[] | null;
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
  selectedStrategies: string[];
  setSelectedStrategies: (val: string[]) => void;
  observations: Observation[];
  addObservation: (imageBase64: string) => void;
  clearObservations: () => void;
  tradingMode: "MANUAL" | "PAPER" | "LIVE";
  setTradingMode: (val: "MANUAL" | "PAPER" | "LIVE") => void;
  marketDataMode: "api" | "visual_only";
  setMarketDataMode: (val: "api" | "visual_only") => void;
  platform: string;
  setPlatform: (val: string) => void;
  tradeDuration: string;
  setTradeDuration: (val: string) => void;
  visibleIndicators: string[];
  setVisibleIndicators: (val: string[]) => void;
  activeConnectionId: string | null;
  setActiveConnectionId: (val: string | null) => void;
  apiFailCount: number;
  incrementFailCount: () => void;
  resetFailCount: () => void;
  observationFrequency: number;
  setObservationFrequency: (val: number) => void;
  updateAnalysis: (data: Partial<TradingState>) => void;
  
  tradeHistory: TradeHistoryEntry[];
  clearAnalysis: () => void;

  // Progressive Analysis
  analysisSessionKey: string | null;
  setAnalysisSessionKey: (key: string | null) => void;
  progressiveAnalyses: ProgressiveAnalysisSummary[];
  addProgressiveAnalysis: (summary: ProgressiveAnalysisSummary) => void;
  isProgressiveAnalyzing: boolean;
  setIsProgressiveAnalyzing: (val: boolean) => void;
  lastAnalyzedObservationIndex: number;
  setLastAnalyzedObservationIndex: (val: number) => void;
  totalFramesCaptured: number;
  currentBatchId: number;
  incrementTotalFrames: () => void;
  incrementBatchId: () => void;
  lastObservationTimestamp: number;
  setLastObservationTimestamp: (val: number) => void;
  clearProgressiveSession: () => void;
  resetFramesButKeepSession: () => void;
}

export const useTradingStore = create<TradingState>((set, get) => ({
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),
  symbol: "",
  setSymbol: (val) => set((state) => {
    if (state.symbol !== val) {
      return { symbol: val, observations: [], progressiveAnalyses: [], lastAnalyzedObservationIndex: -1 };
    }
    return { symbol: val };
  }),
  timeframe: "5m",
  setTimeframe: (val) => set((state) => {
    if (state.timeframe !== val) {
      return { timeframe: val, observations: [], progressiveAnalyses: [], lastAnalyzedObservationIndex: -1 };
    }
    return { timeframe: val };
  }),
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
  requestedIndicators: null,
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
  selectedModel: "gemini-2.0-flash",
  setSelectedModel: (provider, model) => set({ selectedProvider: provider, selectedModel: model, apiFailCount: 0 }),
  selectedStrategies: ["Trend Following"],
  setSelectedStrategies: (val) => set({ selectedStrategies: val }),
  observationFrequency: 15,
  setObservationFrequency: (val) => set({ observationFrequency: val }),
  observations: [],
  addObservation: (imageBase64) => set((state) => {
    let tfSecs = 300;
    const tfMatch = state.timeframe.match(/(\d+)([mhd])/);
    if (tfMatch) {
      if (tfMatch[2] === 'm') tfSecs = parseInt(tfMatch[1]) * 60;
      if (tfMatch[2] === 'h') tfSecs = parseInt(tfMatch[1]) * 3600;
    }
    // We only need to keep enough frames for the next 20-frame batch.
    const maxCacheSize = calculateMaxObservationFrames(); 
    
    const newObs = { timestamp: Date.now(), imageBase64 };
    let updated = [...state.observations, newObs];
    
    let newIndex = state.lastAnalyzedObservationIndex;
    if (updated.length > maxCacheSize) {
      const excess = updated.length - maxCacheSize;
      updated = updated.slice(excess);
      newIndex = Math.max(-1, newIndex - excess);
    }
    
    return { 
      observations: updated, 
      lastAnalyzedObservationIndex: newIndex, 
      totalFramesCaptured: state.totalFramesCaptured + 1,
      lastObservationTimestamp: newObs.timestamp
    };
  }),
  clearObservations: () => set({ 
    observations: [], 
    progressiveAnalyses: [], 
    lastAnalyzedObservationIndex: -1, 
    totalFramesCaptured: 0, 
    currentBatchId: 1,
    lastObservationTimestamp: 0
  }),
  tradingMode: "MANUAL",
  setTradingMode: (val) => set({ tradingMode: val }),
  marketDataMode: "api",
  setMarketDataMode: (val) => set({ marketDataMode: val }),
  platform: "Binance",
  setPlatform: (val) => set({ platform: val }),
  tradeDuration: "5m",
  setTradeDuration: (val) => set({ tradeDuration: val }),
  visibleIndicators: [],
  setVisibleIndicators: (val) => set({ visibleIndicators: val }),
  activeConnectionId: null,
  setActiveConnectionId: (val) => set({ activeConnectionId: val }),
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
    requestedIndicators: null,
    open: null,
    high: null,
    low: null,
    close: null,
    explanation: "",
  }),

  // Progressive Analysis initial state
  analysisSessionKey: null,
  setAnalysisSessionKey: (val) => set({ analysisSessionKey: val }),
  progressiveAnalyses: [],
  addProgressiveAnalysis: (summary) => set((state) => {
    // DO NOT limit to 10. The user said keep history for current session.
    // We will limit it to something reasonable but high like 50 so we don't crash, 
    // but we don't arbitrarily delete Batch 1 when Batch 2 comes.
    const updated = [...state.progressiveAnalyses, summary].slice(-50);
    return { progressiveAnalyses: updated };
  }),
  isProgressiveAnalyzing: false,
  setIsProgressiveAnalyzing: (val) => set({ isProgressiveAnalyzing: val }),
  lastAnalyzedObservationIndex: -1,
  setLastAnalyzedObservationIndex: (val) => set({ lastAnalyzedObservationIndex: val }),
  totalFramesCaptured: 0,
  currentBatchId: 1,
  lastObservationTimestamp: 0,
  setLastObservationTimestamp: (val) => set({ lastObservationTimestamp: val }),
  incrementTotalFrames: () => set((state) => ({ totalFramesCaptured: state.totalFramesCaptured + 1 })),
  incrementBatchId: () => set((state) => ({ currentBatchId: state.currentBatchId + 1 })),
  clearProgressiveSession: () => set({
    observations: [],
    progressiveAnalyses: [],
    lastAnalyzedObservationIndex: -1,
    totalFramesCaptured: 0,
    currentBatchId: 1,
    lastObservationTimestamp: 0
  }),
  resetFramesButKeepSession: () => set({
    observations: [],
    lastAnalyzedObservationIndex: -1,
    totalFramesCaptured: 0,
    // Keep progressiveAnalyses, currentBatchId, and lastObservationTimestamp as they are
  }),

  updateAnalysis: (data) => set((state) => {
    const newState = { ...state, ...data };
    
    // If it's a valid completed analysis, add it to history
    if (data.signal && data.signal !== "UNSURE" && newState.trend && newState.signal) {
      const historyEntry: TradeHistoryEntry = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        symbol: (data as any).detectedSymbol || newState.symbol,
        timeframe: (data as any).recommendedTimeframe || newState.timeframe,
        trend: newState.trend,
        signal: newState.signal,
        confidence: newState.confidence,
        recommendedTimeframe: (data as any).recommendedTimeframe || newState.recommendedTimeframe,
        entryPrice: newState.entryPrice,
        stopLoss: newState.stopLoss,
        takeProfit: newState.takeProfit,
        explanation: newState.explanation,
        status: (newState.signal === "WAIT" || newState.signal === "NO_TRADE") ? "SKIPPED" : "OPEN",
        open: newState.open,
        high: newState.high,
        low: newState.low,
        close: newState.close,
        screenshotBase64: newState.lastImageBase64 || undefined,
        dbTradeId: (data as any).dbTradeId,
        requiredTimeframe: (data as any).requiredTimeframe,
        requestedIndicators: (data as any).requestedIndicators || newState.requestedIndicators,
        detectedSymbol: (data as any).detectedSymbol,
        detectedTimeframe: (data as any).detectedTimeframe,
        exchange: (data as any).exchange,
        marketProvider: (data as any).marketProvider,
        riskDecision: (data as any).riskDecision,
        reasoning: (data as any).reasoning,
        dataConfidence: (data as any).dataConfidence,
      };
      
      newState.tradeHistory = [historyEntry, ...state.tradeHistory];
    }
    
    return newState;
  }),
}));
