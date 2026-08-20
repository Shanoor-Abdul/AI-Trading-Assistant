import { create } from 'zustand';
import { PLATFORMS, TradingPlatform } from './TradingPlatform';



export interface MobileTradingState {
  // Platform & Configuration
  platformId: string;
  setPlatformId: (id: string) => void;
  platformUrl: string;
  setPlatformUrl: (url: string) => void;
  symbol: string;
  setSymbol: (val: string) => void;
  timeframe: string; // Chart timeframe
  setTimeframe: (val: string) => void;
  tradeDuration: string; // Trade timeframe
  setTradeDuration: (val: string) => void;
  
  selectedProvider: string;
  setSelectedProvider: (val: string) => void;
  selectedModel: string;
  setSelectedModel: (val: string) => void;
  selectedStrategies: string[];
  setSelectedStrategies: (val: string[]) => void;
  visibleIndicators: string[];
  setVisibleIndicators: (val: string[]) => void;
  tradingMode: 'MANUAL' | 'PAPER' | 'LIVE';
  setTradingMode: (val: 'MANUAL' | 'PAPER' | 'LIVE') => void;
  riskPercent: number;
  setRiskPercent: (val: number) => void;
  capital: number;
  setCapital: (val: number) => void;

  // AI Analysis Results
  analysisHistory: any[];
  setAnalysisHistory: (val: any[]) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (val: boolean) => void;
  trend: 'Bullish' | 'Bearish' | 'Sideways' | null;
  signal: 'BUY' | 'SELL' | 'WAIT' | 'UNSURE' | 'NO_TRADE' | null;
  confidence: number;
  explanation: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  updateAnalysis: (data: Partial<MobileTradingState>) => void;
  clearAnalysis: () => void;
}

export const useMobileTradingStore = create<MobileTradingState>((set, get) => ({
  // Default values
  platformId: 'binance',
  setPlatformId: (id) => {
    const platform = PLATFORMS[id];
    if (platform) {
      set({ platformId: id, platformUrl: platform.defaultUrl });
    }
  },
  platformUrl: PLATFORMS.binance.defaultUrl,
  setPlatformUrl: (url) => set({ platformUrl: url }),
  symbol: 'BTC/USDT',
  setSymbol: (val) => set({ symbol: val }),
  timeframe: '5m',
  setTimeframe: (val) => set({ timeframe: val }),
  tradeDuration: '5m',
  setTradeDuration: (val) => set({ tradeDuration: val }),

  selectedProvider: 'gemini',
  setSelectedProvider: (val) => set({ selectedProvider: val }),
  selectedModel: 'gemini-2.0-flash',
  setSelectedModel: (val) => set({ selectedModel: val }),
  selectedStrategies: ['Trend Following'],
  setSelectedStrategies: (val) => set({ selectedStrategies: val }),
  visibleIndicators: ['RSI', 'MACD'],
  setVisibleIndicators: (val) => set({ visibleIndicators: val }),
  tradingMode: 'MANUAL',
  setTradingMode: (val) => set({ tradingMode: val }),
  riskPercent: 1,
  setRiskPercent: (val) => set({ riskPercent: val }),
  capital: 1000,
  setCapital: (val) => set({ capital: val }),

  analysisHistory: [],
  setAnalysisHistory: (val) => set({ analysisHistory: val }),
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),
  trend: null,
  signal: null,
  confidence: 0,
  explanation: "",
  entryPrice: null,
  stopLoss: null,
  takeProfit: null,
  updateAnalysis: (data) => set((state) => ({ ...state, ...data })),
  clearAnalysis: () => set({ trend: null, signal: null, confidence: 0, explanation: "", entryPrice: null, stopLoss: null, takeProfit: null }),
}));
