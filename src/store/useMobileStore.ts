import { create } from 'zustand';
import { TradingAnalysis, TradeHistoryEntry } from '@/lib/types';

export interface MobileState {
  platform: string;
  symbol: string;
  tradeDuration: string;
  primaryTimeframe: string;
  confirmationTimeframe: string;
  selectedStrategies: string[];
  selectedProvider: string;
  selectedModel: string;
  useDualModel: boolean;
  selectedReasoningProvider: string;
  selectedReasoningModel: string;
  marketDataMode: "api" | "visual_only";
  visibleIndicators: string[];
  previewImageBase64: string | null;
  isAnalyzing: boolean;
  analysisResult: TradingAnalysis | null;
  tradeHistory: TradeHistoryEntry[];
  pendingUnsureRequest: boolean;
  requestedTimeframe: string | null;
  previousAnalysisData: any | null;
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
  selectedStrategies: ["Auto (AI Selection)"],
  selectedProvider: "gemini",
  selectedModel: "gemini-2.0-flash",
  useDualModel: false,
  selectedReasoningProvider: "openrouter",
  selectedReasoningModel: "meta-llama/llama-3-8b-instruct:free",
  marketDataMode: "visual_only",
  visibleIndicators: [],
  previewImageBase64: null,
  isAnalyzing: false,
  analysisResult: null,
  tradeHistory: [],
  pendingUnsureRequest: false,
  requestedTimeframe: null,
  previousAnalysisData: null,

  setField: (field, value) =>
    set((state) => {
      if (field === "tradeHistory" && Array.isArray(value)) {
        const history = (value as TradeHistoryEntry[]).map((trade) => ({
          ...trade,
          tradeDuration: trade.tradeDuration || state.tradeDuration,
        }));
        return { tradeHistory: history };
      }
      return { [field]: value } as Partial<MobileState>;
    }),

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
  })
}));
