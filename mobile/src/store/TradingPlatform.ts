export interface TradingPlatform {
  id: string;
  name: string;
  defaultUrl: string;
  type: 'webview' | 'api';
}

export const PLATFORMS: Record<string, TradingPlatform> = {
  binance: {
    id: 'binance',
    name: 'Binance',
    defaultUrl: 'https://www.binance.com/en/trade/BTC_USDT',
    type: 'webview',
  },
  tradingview: {
    id: 'tradingview',
    name: 'TradingView',
    defaultUrl: 'https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT',
    type: 'webview',
  },
  binomo: {
    id: 'binomo',
    name: 'Binomo',
    defaultUrl: 'https://binany.com/',
    type: 'webview',
  },
  bybit: {
    id: 'bybit',
    name: 'Bybit',
    defaultUrl: 'https://www.bybit.com/trade/spot/BTC/USDT',
    type: 'webview',
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    defaultUrl: 'https://www.google.com', // User can override
    type: 'webview',
  }
};

export const getPlatformOptions = () => Object.values(PLATFORMS);
