import WebSocket from 'ws';
import { EventEmitter } from "events";

export interface MarketTick {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
  isBuyerMaker: boolean; // True if it was a sell market order hitting a buy limit
}

export class MarketStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private symbols: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isIntentionalClose = false;

  constructor() {
    super();
  }

  public subscribe(symbol: string) {
    const formattedSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
    this.symbols.add(formattedSymbol);
    this.connect();
  }

  public unsubscribe(symbol: string) {
    const formattedSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
    this.symbols.delete(formattedSymbol);
    if (this.symbols.size === 0) {
      this.disconnect();
    } else {
      this.connect();
    }
  }

  private connect() {
    if (this.symbols.size === 0) return;
    
    if (this.ws) {
      this.isIntentionalClose = true;
      this.ws.close();
    }

    this.isIntentionalClose = false;
    const streams = Array.from(this.symbols).map((s) => ${s}@aggTrade).join("/");
    const url = wss://stream.binance.com:9443/stream?streams=;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log([MarketStream] Connected to Binance WS: );
      this.reconnectAttempts = 0;
      this.emit("connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.data && payload.data.e === "aggTrade") {
          const tick: MarketTick = {
            symbol: payload.data.s,
            price: parseFloat(payload.data.p),
            volume: parseFloat(payload.data.q),
            timestamp: payload.data.T,
            isBuyerMaker: payload.data.m,
          };
          this.emit("tick", tick);
        }
      } catch (err) {
        console.error("[MarketStream] Error parsing WS message:", err);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[MarketStream] WS Error:", error);
      this.emit("error", error);
    };

    this.ws.onclose = () => {
      console.log("[MarketStream] WS Connection Closed");
      this.ws = null;
      if (!this.isIntentionalClose) {
        this.attemptReconnect();
      }
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log([MarketStream] Reconnecting in ms... (Attempt ));
      setTimeout(() => this.connect(), delay);
    } else {
      console.error("[MarketStream] Max reconnect attempts reached. Stream dead.");
      this.emit("dead");
    }
  }

  public disconnect() {
    this.isIntentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.symbols.clear();
  }
}

export const marketStream = new MarketStream();
