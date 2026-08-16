"use client";

import { useEffect } from "react";
import { Clock3 } from "lucide-react";
import { TradeCountdown } from "@/components/TradeCountdown";
import { parseTradeDurationMs } from "@/lib/tradeDuration";
import { useTradingStore } from "@/store/useTradingStore";

export function TradeTracker() {
  const { tradeHistory } = useTradingStore();

  useEffect(() => {
    const openTrades = tradeHistory.filter(
      (t) => t.status === "OPEN" && t.signal !== "WAIT" && t.signal !== "UNSURE",
    );
    if (openTrades.length === 0) return;

    const interval = setInterval(async () => {
      let updated = false;
      const newHistory = [...tradeHistory];

      for (let i = 0; i < newHistory.length; i++) {
        const trade = newHistory[i];
        if (trade.status !== "OPEN" || trade.signal === "WAIT" || trade.signal === "UNSURE") continue;

        try {
          const symbol = trade.symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();

          if (symbol.includes("OTC") || useTradingStore.getState().marketDataMode === "visual_only") {
            continue;
          }

          const activeConnectionId = useTradingStore.getState().activeConnectionId;
          const url = `/api/ticker?symbol=${symbol}${activeConnectionId ? `&connectionId=${activeConnectionId}` : ''}`;
          const res = await fetch(url);
          if (!res.ok) continue;

          const data = await res.json();
          if (!data.price) continue;

          const currentPrice = parseFloat(data.price);
          const entry = trade.entryPrice;
          const tp = trade.takeProfit;
          const sl = trade.stopLoss;

          if (!entry || !tp || !sl) continue;

          let tradeUpdated = false;

          if (trade.signal === "BUY") {
            if (currentPrice >= tp) {
              trade.status = "WON";
              tradeUpdated = true;
            } else if (currentPrice <= sl) {
              trade.status = "LOST";
              tradeUpdated = true;
            }

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

          if (tradeUpdated) {
            updated = true;

            if ((trade.status === "WON" || trade.status === "LOST") && trade.dbTradeId) {
              fetch("/api/review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tradeId: trade.dbTradeId,
                  finalStatus: trade.status,
                  pnl:
                    trade.status === "WON"
                      ? trade.takeProfit! - trade.entryPrice!
                      : trade.entryPrice! - trade.stopLoss!,
                  maxFavorableMove: trade.maxFavorableMove,
                  maxAdverseMove: trade.maxAdverseMove,
                }),
              }).catch((err) => console.error("Failed to trigger review:", err));
            }
          }
        } catch (err) {
          console.error("Trade tracking error", err);
        }
      }

      if (updated) {
        useTradingStore.setState({ tradeHistory: newHistory });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [tradeHistory]);

  return null;
}
