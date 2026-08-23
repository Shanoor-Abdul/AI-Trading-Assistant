import { MarketProvider, OHLCV, Ticker } from "./MarketProvider";

const DATA_BASE_URL = "https://data.alpaca.markets/v1beta3/crypto/us";

function toAlpacaTimeframe(timeframe: string): string {
  const normalized = (timeframe || "5m").trim().toLowerCase();
  const match = normalized.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) throw new Error(`Unsupported Alpaca timeframe: ${timeframe}`);

  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return `${value}Sec`;
  if (unit === "m") return `${value}Min`;
  if (unit === "h") return `${value}Hour`;
  return `${value}Day`;
}

function normalizeSymbol(symbol: string): string {
  const value = (symbol || "").trim().toUpperCase();
  if (!value || !value.includes("/")) {
    throw new Error("Alpaca crypto symbol must use BASE/QUOTE format, for example BTC/USD.");
  }
  return value;
}

export class AlpacaProvider implements MarketProvider {
  name = "alpaca";
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey || process.env.ALPACA_API_KEY || "";
    this.apiSecret = apiSecret || process.env.ALPACA_SECRET_KEY || "";

    if (!this.apiKey || !this.apiSecret) {
      throw new Error("Alpaca API credentials are not configured on the server.");
    }
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${DATA_BASE_URL}${path}`, {
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Alpaca market-data request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }

    return response.json() as Promise<T>;
  }

  async testConnection(): Promise<boolean> {
    const response = await fetch("https://paper-api.alpaca.markets/v2/account", {
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Alpaca account validation failed (${response.status}).`);
    }

    return true;
  }

  async fetchOHLCV(symbol: string, timeframe: string, limit = 200): Promise<OHLCV[]> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const alpacaTimeframe = toAlpacaTimeframe(timeframe);
    const params = new URLSearchParams({
      symbols: normalizedSymbol,
      timeframe: alpacaTimeframe,
      limit: String(Math.min(Math.max(limit, 1), 10000)),
      sort: "asc",
    });

    const data = await this.request<{ bars?: Record<string, Array<Record<string, number>>> }>(`/bars?${params.toString()}`);
    const bars = data.bars?.[normalizedSymbol] || data.bars?.[normalizedSymbol.replace("/", "")] || [];

    return bars.map((bar) => ({
      openTime: Number(bar.t),
      open: Number(bar.o),
      high: Number(bar.h),
      low: Number(bar.l),
      close: Number(bar.c),
      volume: Number(bar.v),
    }));
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const params = new URLSearchParams({ symbols: normalizedSymbol });
    const data = await this.request<{ snapshots?: Record<string, { latestTrade?: { p?: number }; minuteBar?: { c?: number; v?: number }; dailyBar?: { h?: number; l?: number; v?: number } }> }>(`/snapshots?${params.toString()}`);
    const snapshot = data.snapshots?.[normalizedSymbol] || data.snapshots?.[normalizedSymbol.replace("/", "")];

    if (!snapshot) throw new Error(`Alpaca returned no market snapshot for ${normalizedSymbol}.`);

    const last = Number(snapshot.latestTrade?.p ?? snapshot.minuteBar?.c);
    if (!Number.isFinite(last)) throw new Error(`Alpaca returned no current price for ${normalizedSymbol}.`);

    return {
      symbol: normalizedSymbol,
      last,
      high: snapshot.dailyBar?.h,
      low: snapshot.dailyBar?.l,
      volume: snapshot.dailyBar?.v ?? snapshot.minuteBar?.v,
    };
  }

  async fetchOrderBook(_symbol: string, _limit = 20) {
    return { bids: [], asks: [] };
  }
}
