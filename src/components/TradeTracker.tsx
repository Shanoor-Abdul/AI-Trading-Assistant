"use client";

import { useEffect } from "react";
import { useTradingStore } from "@/store/useTradingStore";

export function TradeTracker() {
  const { tradeHistory, updateAnalysis } = useTradingStore();

  useEffect(() => {
    // Only track if there are open trades
    const openTrades = tradeHistory.filter(t => t.status === "OPEN" && t.signal !== "WAIT" && t.signal !== "UNSURE");
    if (openTrades.length === 0) return;

    const interval = setInterval(async () => {
      let updated = false;
      const newHistory = [...tradeHistory];

      for (let i = 0; i < newHistory.length; i++) {
        const trade = newHistory[i];
        if (trade.status !== "OPEN" || trade.signal === "WAIT" || trade.signal === "UNSURE") continue;

        try {
          // Fetch latest price data for this symbol
          const symbol = trade.symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
          
          // Binance public API doesn't support OTC pairs, so don't attempt to track them to avoid 400 errors
          if (symbol.includes("OTC")) continue;

          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
          if (!res.ok) continue;
          
          const data = await res.json();
          const currentPrice = parseFloat(data.price);

          const entry = trade.entryPrice;
          const tp = trade.takeProfit;
          const sl = trade.stopLoss;

          if (!entry || !tp || !sl) continue;

          let tradeUpdated = false;

          // Check if TP or SL is hit
          if (trade.signal === "BUY") {
            if (currentPrice >= tp) {
              trade.status = "WON";
              tradeUpdated = true;
            } else if (currentPrice <= sl) {
              trade.status = "LOST";
              tradeUpdated = true;
            }
            
            // Calculate Max Favorable/Adverse moves
            const favorable = currentPrice - entry;
            const adverse = entry - currentPrice;
            if (!trade.maxFavorableMove || favorable > trade.maxFavorableMove) {
              trade.maxFavorableMove = Math.max(0, favorable);
              tradeUpdated = true;
            }
            if (!trade.maxAdverseMove || adverse > trade.maxAdverseMove) {
              trade.maxAdverseMove = Math.max(0, adverse);
              tradeUpdated = true;
            }
          } else if (trade.signal === "SELL") {
            if (currentPrice <= tp) {
              trade.status = "WON";
              tradeUpdated = true;
            } else if (currentPrice >= sl) {
              trade.status = "LOST";
              tradeUpdated = true;
            }
            
            // Calculate Max Favorable/Adverse moves
            const favorable = entry - currentPrice;
            const adverse = currentPrice - entry;
            if (!trade.maxFavorableMove || favorable > trade.maxFavorableMove) {
              trade.maxFavorableMove = Math.max(0, favorable);
              tradeUpdated = true;
            }
            if (!trade.maxAdverseMove || adverse > trade.maxAdverseMove) {
              trade.maxAdverseMove = Math.max(0, adverse);
              tradeUpdated = true;
            }
          }

          if (tradeUpdated) updated = true;

        } catch (err) {
          console.error("Trade tracking error", err);
        }
      }

      if (updated) {
        useTradingStore.setState({ tradeHistory: newHistory });
      }

    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [tradeHistory]);

  return null; // Silent background component
}
