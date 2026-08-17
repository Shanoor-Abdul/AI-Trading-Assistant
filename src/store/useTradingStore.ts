import { create } from "zustand";
import { TradeHistoryEntry, ProgressiveAnalysisSummary, Observation, Trend, Signal } from "@/lib/types";
import { calculateMaxObservationFrames } from "@/lib/observation/calculation";

// Trade history is synchronized by the dashboard's single initial loader and
// explicit create/delete operations. Do not refetch the whole table after
// every signal; doing so can race with deletes and resurrect stale rows.

export interface TradingState {
  isAnalyzing: boolean; setIsAnalyzing: (val: boolean) => void;
  isLiveObservationEnabled: boolean; setIsLiveObservationEnabled: (val: boolean) => void;
  symbol: string; setSymbol: (val: string) => void;
  timeframe: string; setTimeframe: (val: string) => void;
  stream: MediaStream | null; setStream: (stream: MediaStream | null) => void;
  lastImageBase64: string | null; setLastImageBase64: (val: string | null) => void;
  isFetchingAnalysis: boolean; setIsFetchingAnalysis: (val: boolean) => void;
  isAutoScan: boolean; setIsAutoScan: (val: boolean) => void;
  trend: "Bullish" | "Bearish" | "Sideways" | null;
  signal: "BUY" | "SELL" | "WAIT" | "UNSURE" | "NO_TRADE" | null;
  confidence: number;
  entryPrice: number | null; stopLoss: number | null; takeProfit: number | null;
  recommendedTimeframe: string | null; requestedIndicators: string[] | null;
  open: number | null; high: number | null; low: number | null; close: number | null;
  explanation: string;
  capital: number; setCapital: (val: number) => void;
  riskPercent: number; setRiskPercent: (val: number) => void;
  selectedProvider: string; selectedModel: string;
  setSelectedModel: (provider: string, model: string) => void;
  selectedStrategies: string[]; setSelectedStrategies: (val: string[]) => void;
  observations: Observation[]; addObservation: (imageBase64: string) => void; clearObservations: () => void;
  tradingMode: "MANUAL" | "PAPER" | "LIVE"; setTradingMode: (val: "MANUAL" | "PAPER" | "LIVE") => void;
  marketDataMode: "api" | "visual_only"; setMarketDataMode: (val: "api" | "visual_only") => void;
  platform: string; setPlatform: (val: string) => void;
  tradeDuration: string; setTradeDuration: (val: string) => void;
  visibleIndicators: string[]; setVisibleIndicators: (val: string[]) => void;
  activeConnectionId: string | null; setActiveConnectionId: (val: string | null) => void;
  apiFailCount: number; incrementFailCount: () => void; resetFailCount: () => void;
  observationFrequency: number; setObservationFrequency: (val: number) => void;
  updateAnalysis: (data: Partial<TradingState>) => void;
  tradeHistory: TradeHistoryEntry[]; tradeHistoryLoaded: boolean; clearAnalysis: () => void;
  analysisSessionKey: string | null; setAnalysisSessionKey: (key: string | null) => void;
  progressiveAnalyses: ProgressiveAnalysisSummary[]; addProgressiveAnalysis: (summary: ProgressiveAnalysisSummary) => void;
  isProgressiveAnalyzing: boolean; setIsProgressiveAnalyzing: (val: boolean) => void;
  lastAnalyzedObservationIndex: number; setLastAnalyzedObservationIndex: (val: number) => void;
  totalFramesCaptured: number; currentBatchId: number;
  incrementTotalFrames: () => void; incrementBatchId: () => void;
  lastObservationTimestamp: number; setLastObservationTimestamp: (val: number) => void;
  clearProgressiveSession: () => void; resetFramesButKeepSession: () => void;
  stopLiveObservationSession: () => void;
  aiReadiness: string | null;
  aiEstimatedConfidence: string | null;
  retryProgressiveAnalysis: boolean; setRetryProgressiveAnalysis: (val: boolean) => void;
  retryLoading: boolean; setRetryLoading: (val: boolean) => void;
  lastFailedPendingCount: number; setLastFailedPendingCount: (val: number) => void;
  macroTimeframeImage: string | null; setMacroTimeframeImage: (val: string | null) => void;
  confirmationTimeframeImage: string | null; setConfirmationTimeframeImage: (val: string | null) => void;
  structureTimeframeImage: string | null; setStructureTimeframeImage: (val: string | null) => void;
}

const resetObservationState = () => ({
  observations: [] as Observation[],
  progressiveAnalyses: [] as ProgressiveAnalysisSummary[],
  lastAnalyzedObservationIndex: -1,
  totalFramesCaptured: 0,
  currentBatchId: 1,
  lastObservationTimestamp: 0,
  aiReadiness: null as string | null,
  aiEstimatedConfidence: null as string | null,
  retryProgressiveAnalysis: false,
  retryLoading: false,
  lastFailedPendingCount: 0,
  macroTimeframeImage: null as string | null,
  confirmationTimeframeImage: null as string | null,
  structureTimeframeImage: null as string | null,
});

type ClearAnalysisState = Pick<TradingState, "trend" | "signal" | "confidence" | "entryPrice" | "stopLoss" | "takeProfit" | "recommendedTimeframe" | "requestedIndicators" | "open" | "high" | "low" | "close" | "explanation">;

const clearAnalysisState: ClearAnalysisState = {
  trend: null, signal: null, confidence: 0, entryPrice: null, stopLoss: null, takeProfit: null,
  recommendedTimeframe: null, requestedIndicators: null, open: null, high: null, low: null, close: null, explanation: "",
};

const resetObservationSessionState = () => ({ ...resetObservationState(), ...clearAnalysisState });
const invalidateProgressiveAnalyses = () => ({ ...resetObservationSessionState() });

export const useTradingStore = create<TradingState>((set, get) => ({
  isAnalyzing: false, setIsAnalyzing: (val) => set({ isAnalyzing: val }),
  isLiveObservationEnabled: false, setIsLiveObservationEnabled: (val) => set({ isLiveObservationEnabled: val }),
  symbol: "", setSymbol: (val) => set((state) => state.symbol !== val ? { symbol: val, ...resetObservationSessionState() } : { symbol: val }),
  timeframe: "5m", setTimeframe: (val) => set((state) => state.timeframe !== val ? { timeframe: val, ...resetObservationSessionState() } : { timeframe: val }),
  stream: null, setStream: (stream) => set({ stream }),
  lastImageBase64: null, setLastImageBase64: (val) => set({ lastImageBase64: val }),
  isFetchingAnalysis: false,
  setIsFetchingAnalysis: (val) => set((state) => val ? { ...state, isFetchingAnalysis: true, ...clearAnalysisState } : { isFetchingAnalysis: false }),
  isAutoScan: false, setIsAutoScan: (val) => set({ isAutoScan: val }),
  trend: null, signal: null, confidence: 0, entryPrice: null, stopLoss: null, takeProfit: null,
  recommendedTimeframe: null, requestedIndicators: null, open: null, high: null, low: null, close: null, explanation: "",
  capital: 1000, setCapital: (val) => set({ capital: val }), riskPercent: 1, setRiskPercent: (val) => set({ riskPercent: val }),
  selectedProvider: "gemini", selectedModel: "gemini-2.0-flash",
  setSelectedModel: (provider, model) => set(() => ({ selectedProvider: provider, selectedModel: model, apiFailCount: 0, ...invalidateProgressiveAnalyses() })),
  selectedStrategies: ["Trend Following"], setSelectedStrategies: (val) => set((state) => JSON.stringify(state.selectedStrategies) !== JSON.stringify(val) ? { selectedStrategies: val, ...resetObservationSessionState() } : { selectedStrategies: val }),
  observationFrequency: 15, setObservationFrequency: (val) => set((state) => state.observationFrequency !== val ? { observationFrequency: val, ...resetObservationSessionState() } : { observationFrequency: val }),
  observations: [],
  addObservation: (imageBase64) => set((state) => {
    const newObservation: Observation = { timestamp: Date.now(), imageBase64 };
    let observations = [...state.observations, newObservation];
    let lastAnalyzedObservationIndex = state.lastAnalyzedObservationIndex;
    const evictedCount = Math.max(0, observations.length - calculateMaxObservationFrames());
    if (evictedCount > 0) {
      observations = observations.slice(evictedCount);
      if (lastAnalyzedObservationIndex >= 0) lastAnalyzedObservationIndex = Math.max(-1, lastAnalyzedObservationIndex - evictedCount);
    }
    return { observations, lastAnalyzedObservationIndex, totalFramesCaptured: state.totalFramesCaptured + 1, lastObservationTimestamp: newObservation.timestamp };
  }),
  clearObservations: () => set({ ...resetObservationSessionState() }),
  tradingMode: "MANUAL", setTradingMode: (val) => set({ tradingMode: val }),
  marketDataMode: "api", setMarketDataMode: (val) => set((state) => state.marketDataMode !== val ? { marketDataMode: val, ...resetObservationSessionState() } : { marketDataMode: val }),
  platform: "Binance", setPlatform: (val) => set((state) => state.platform !== val ? { platform: val, ...resetObservationSessionState() } : { platform: val }),
  tradeDuration: "5m", setTradeDuration: (val) => set((state) => state.tradeDuration !== val ? { tradeDuration: val, ...resetObservationSessionState() } : { tradeDuration: val }),
  visibleIndicators: [], setVisibleIndicators: (val) => set((state) => JSON.stringify(state.visibleIndicators) !== JSON.stringify(val) ? { visibleIndicators: val, ...resetObservationSessionState() } : { visibleIndicators: val }),
  activeConnectionId: null, setActiveConnectionId: (val) => set({ activeConnectionId: val }),
  apiFailCount: 0, incrementFailCount: () => set((state) => ({ apiFailCount: state.apiFailCount + 1 })), resetFailCount: () => set({ apiFailCount: 0 }),
  tradeHistory: [], tradeHistoryLoaded: false,
  clearAnalysis: () => set({ ...clearAnalysisState }),
  analysisSessionKey: null, setAnalysisSessionKey: (val) => set({ analysisSessionKey: val }),
  progressiveAnalyses: [],
  addProgressiveAnalysis: (summary) => set((state) => {
    const normalized: ProgressiveAnalysisSummary = { ...summary, frameStart: (summary.batchId - 1) * 20 + 1, frameEnd: summary.batchId * 20, source: summary.source || "progressive" };
    const withoutDuplicate = state.progressiveAnalyses.filter((analysis) => analysis.batchId !== normalized.batchId);
    return { progressiveAnalyses: [...withoutDuplicate, normalized].sort((a, b) => a.batchId - b.batchId).slice(-50) };
  }),
  isProgressiveAnalyzing: false, setIsProgressiveAnalyzing: (val) => set({ isProgressiveAnalyzing: val }),
  lastAnalyzedObservationIndex: -1,
  setLastAnalyzedObservationIndex: (val) => set((state) => {
    if (val < 0 || val >= state.observations.length) return { lastAnalyzedObservationIndex: val };
    const consumedCount = val + 1;
    return { observations: state.observations.slice(consumedCount), lastAnalyzedObservationIndex: -1, totalFramesCaptured: Math.max(0, state.totalFramesCaptured - consumedCount) };
  }),
  totalFramesCaptured: 0, currentBatchId: 1,
  lastObservationTimestamp: 0, setLastObservationTimestamp: (val) => set({ lastObservationTimestamp: val }),
  incrementTotalFrames: () => set((state) => ({ totalFramesCaptured: state.totalFramesCaptured + 1 })),
  incrementBatchId: () => set((state) => ({ currentBatchId: state.currentBatchId + 1 })),
  resetFramesButKeepSession: () => set((state) => ({ observations: [], lastAnalyzedObservationIndex: -1, totalFramesCaptured: 0, lastObservationTimestamp: 0, aiReadiness: state.aiReadiness, aiEstimatedConfidence: state.aiEstimatedConfidence, progressiveAnalyses: state.progressiveAnalyses, currentBatchId: state.currentBatchId })),
  stopLiveObservationSession: () => set({ 
    isLiveObservationEnabled: false,
    observations: [],
    lastAnalyzedObservationIndex: -1,
    totalFramesCaptured: 0,
    lastObservationTimestamp: 0,
    retryProgressiveAnalysis: false,
    lastFailedPendingCount: 0,
    aiReadiness: null,
    aiEstimatedConfidence: null,
  }),
  clearProgressiveSession: () => set({ ...resetObservationSessionState() }),
  aiReadiness: null, aiEstimatedConfidence: null,
  retryProgressiveAnalysis: false, setRetryProgressiveAnalysis: (val) => set({ retryProgressiveAnalysis: val }),
  retryLoading: false, setRetryLoading: (val) => set({ retryLoading: val }),
  lastFailedPendingCount: 0, setLastFailedPendingCount: (val) => set({ lastFailedPendingCount: val }),
  macroTimeframeImage: null, setMacroTimeframeImage: (val) => set({ macroTimeframeImage: val }),
  confirmationTimeframeImage: null, setConfirmationTimeframeImage: (val) => set({ confirmationTimeframeImage: val }),
  structureTimeframeImage: null, setStructureTimeframeImage: (val) => set({ structureTimeframeImage: val }),
  updateAnalysis: (data) => {
    set((state) => {
      const newState = { ...state, ...data };
      const aiData = data as any;
      if (aiData.readiness !== undefined || aiData.estimatedConfidence !== undefined) {
        newState.aiReadiness = aiData.readiness ?? state.aiReadiness;
        newState.aiEstimatedConfidence = aiData.estimatedConfidence ?? state.aiEstimatedConfidence;
      }
      if (data.signal === "BUY" || data.signal === "SELL") {
        const historyTrend: Trend = data.trend ?? newState.trend ?? "Sideways";
        const historySignal: Signal = data.signal;
        const historyEntry: TradeHistoryEntry = {
          id: Math.random().toString(36).substring(2, 9), timestamp: Date.now(),
          symbol: (data as any).detectedSymbol || newState.symbol,
          timeframe: (data as any).recommendedTimeframe || newState.timeframe,
          trend: historyTrend, signal: historySignal, confidence: newState.confidence,
          recommendedTimeframe: (data as any).recommendedTimeframe || newState.recommendedTimeframe,
          entryPrice: newState.entryPrice, stopLoss: newState.stopLoss, takeProfit: newState.takeProfit,
          explanation: newState.explanation, status: "OPEN", open: newState.open, high: newState.high, low: newState.low, close: newState.close,
          screenshotBase64: newState.lastImageBase64 || undefined, dbTradeId: (data as any).dbTradeId,
          requiredTimeframe: (data as any).requiredTimeframe, requestedIndicators: (data as any).requestedIndicators || newState.requestedIndicators,
          detectedSymbol: (data as any).detectedSymbol, detectedTimeframe: (data as any).detectedTimeframe,
          exchange: (data as any).exchange, marketProvider: (data as any).marketProvider,
          riskDecision: (data as any).riskDecision, reasoning: (data as any).reasoning, dataConfidence: (data as any).dataConfidence,
        };
        newState.tradeHistory = [historyEntry, ...state.tradeHistory];
        newState.tradeHistoryLoaded = true;
      }
      return newState;
    });
    // Do not refetch /api/trades here. The analysis response already creates
    // the local history entry; a background full-table GET could race with
    // DELETE and resurrect stale rows or hide a just-created row.
  },
}));