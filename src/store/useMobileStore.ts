import { create } from 'zustand';
import { TradingAnalysis, TradeHistoryEntry } from '@/lib/types';

export interface MobileState {
  // Form state
  platform: string;
  symbol: string;
  tradeDuration: string;
  primaryTimeframe: string;
  confirmationTimeframe: string;
  strategy: string;
  selectedProvider: string;
  selectedModel: string;
  marketDataMode: "api" | "visual_only";
  
  // Image state
  previewImageBase64: string | null;
  
  // App state
  isAnalyzing: boolean;
  analysisResult: TradingAnalysis | null;
  tradeHistory: TradeHistoryEntry[];
  
  // Unsure workflow state
  pendingUnsureRequest: boolean;
  requestedTimeframe: string | null;
  previousAnalysisData: any | null;

  // Actions
  setField: (field: keyof MobileState, value: any) => void;
  clearAnalysis: () => void;
  resetAll: () => void;
}

export const useMobileStore = create<MobileState>((set) => ({
  platform: "OlympTrade",
  symbol: "AUD/CAD OTC",
  tradeDuration: "5m",
  primaryTimeframe: "5m",
  confirmationTimeframe: "15m",
  strategy: "Trend Following",
  selectedProvider: "gemini",
  selectedModel: "gemini-2.5-flash",
  marketDataMode: "visual_only",
  
  previewImageBase64: null,
  
  isAnalyzing: false,
  analysisResult: null,
  tradeHistory: [],
  
  pendingUnsureRequest: false,
  requestedTimeframe: null,
  previousAnalysisData: null,

  setField: (field, value) => set({ [field]: value }),
  
  clearAnalysis: () => set({
    previewImageBase64: null,
    analysisResult: null,
    pendingUnsureRequest: false,
    requestedTimeframe: null,
    previousAnalysisData: null,
  }),
  
  resetAll: () => set({
    previewImageBase64: null,
    analysisResult: null,
    pendingUnsureRequest: false,
    requestedTimeframe: null,
    previousAnalysisData: null,
    // Note: intentionally not clearing tradeHistory
  })
}));
