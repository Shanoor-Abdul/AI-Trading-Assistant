import { create } from 'zustand';
import { TradingAnalysis, TradeHistoryEntry } from '@/lib/types';
import {
  appendMobileObservation,
  MOBILE_VISUAL_HISTORY_LIMIT,
  MobileVisualObservation,
} from '@/lib/mobile/visualHistory';

export interface MobileState {
  platform: string;
  symbol: string;
  tradeDuration: string;
  primaryTimeframe: string;
  confirmationTimeframe: string;
  selectedStrategies: string[];
  selectedProvider: string;
  selectedModel: string;
  marketDataMode: "api" | "visual_only";
  visibleIndicators: string[];
  previewImageBase64: string | null;
  visualHistory: MobileVisualObservation[];
  isAnalyzing: boolean;
  analysisResult: TradingAnalysis | null;
  tradeHistory: TradeHistoryEntry[];
  pendingUnsureRequest: boolean;
  requestedTimeframe: string | null;
  previousAnalysisData: TradingAnalysis | null;
  setField: <K extends keyof MobileState>(field: K, value: MobileState[K]) => void;
  addVisualObservation: (base64: string) => void;
  clearVisualHistory: () => void;
  clearAnalysis: () => void;
  resetAll: () => void;
}

export const useMobileStore = create<MobileState>((set) => ({
  platform: "",
  symbol: "AUD/CAD OTC",
  tradeDuration: "5m",
  primaryTimeframe: "5m",
  confirmationTimeframe: "15m",
  selectedStrategies: ["Trend Following"],
  selectedProvider: "gemini",
  selectedModel: "gemini-2.0-flash",
  marketDataMode: "visual_only",
  visibleIndicators: [],
  previewImageBase64: null,
  visualHistory: [],
  isAnalyzing: false,
  analysisResult: null,
  tradeHistory: [],
  pendingUnsureRequest: false,
  requestedTimeframe: null,
  previousAnalysisData: null,
  setField: (field, value) => set({ [field]: value }),
  addVisualObservation: (base64) => set((state) => ({
    previewImageBase64: base64,
    visualHistory: appendMobileObservation(state.visualHistory, {
      timestamp: Date.now(),
      base64,
      timeframe: state.primaryTimeframe,
    }, MOBILE_VISUAL_HISTORY_LIMIT),
  })),
  clearVisualHistory: () => set({ previewImageBase64: null, visualHistory: [] }),
  clearAnalysis: () => set({
    previewImageBase64: null,
    visualHistory: [],
    analysisResult: null,
    pendingUnsureRequest: false,
    requestedTimeframe: null,
    previousAnalysisData: null,
  }),
  resetAll: () => set({
    previewImageBase64: null,
    visualHistory: [],
    analysisResult: null,
    pendingUnsureRequest: false,
    requestedTimeframe: null,
    previousAnalysisData: null,
  }),
}));
