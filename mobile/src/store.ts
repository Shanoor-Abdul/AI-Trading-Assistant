import { create } from "zustand";
import type { MobileConfig, Observation, TradingAnalysis } from "./types";

const MAX_OBSERVATIONS = 20;

const initialConfig: MobileConfig = {
  platform: "Trading Platform",
  symbol: "",
  tradeDuration: "5m",
  primaryTimeframe: "5m",
  selectedStrategies: ["Trend Following"],
  visibleIndicators: [],
  selectedProvider: "gemini",
  selectedModel: "gemini-2.0-flash",
};

const makeSessionKey = (config: MobileConfig) =>
  JSON.stringify({
    ...config,
    symbol: config.symbol.trim().toUpperCase(),
    selectedStrategies: [...config.selectedStrategies].sort(),
    visibleIndicators: [...config.visibleIndicators].sort(),
  });

type MobileState = MobileConfig & {
  sessionKey: string;
  observations: Observation[];
  previousAnalysis: TradingAnalysis | null;
  analysisHistory: TradingAnalysis[];
  currentAnalysis: TradingAnalysis | null;
  isAnalyzing: boolean;
  setConfig: <K extends keyof MobileConfig>(key: K, value: MobileConfig[K]) => void;
  addObservation: (observation: Observation) => void;
  clearObservations: () => void;
  setAnalyzing: (value: boolean) => void;
  saveAnalysis: (analysis: TradingAnalysis) => void;
  resetSession: () => void;
};

export const useMobileStore = create<MobileState>((set, get) => ({
  ...initialConfig,
  sessionKey: makeSessionKey(initialConfig),
  observations: [],
  previousAnalysis: null,
  analysisHistory: [],
  currentAnalysis: null,
  isAnalyzing: false,

  setConfig: (key, value) => {
    const next = { ...get(), [key]: value } as MobileState;
    const nextConfig: MobileConfig = {
      platform: next.platform,
      symbol: next.symbol,
      tradeDuration: next.tradeDuration,
      primaryTimeframe: next.primaryTimeframe,
      selectedStrategies: next.selectedStrategies,
      visibleIndicators: next.visibleIndicators,
      selectedProvider: next.selectedProvider,
      selectedModel: next.selectedModel,
    };
    const nextKey = makeSessionKey(nextConfig);
    if (nextKey !== get().sessionKey) {
      set({
        [key]: value,
        sessionKey: nextKey,
        observations: [],
        previousAnalysis: null,
        analysisHistory: [],
        currentAnalysis: null,
      } as Partial<MobileState>);
      return;
    }
    set({ [key]: value } as Partial<MobileState>);
  },

  addObservation: (observation) =>
    set((state) => ({
      observations: [...state.observations, observation].slice(-MAX_OBSERVATIONS),
    })),

  clearObservations: () => set({ observations: [] }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

  saveAnalysis: (analysis) =>
    set((state) => ({
      previousAnalysis: analysis,
      currentAnalysis: analysis,
      analysisHistory: [...state.analysisHistory, analysis].slice(-10),
    })),

  resetSession: () =>
    set({
      observations: [],
      previousAnalysis: null,
      analysisHistory: [],
      currentAnalysis: null,
    }),
}));

export { MAX_OBSERVATIONS };
