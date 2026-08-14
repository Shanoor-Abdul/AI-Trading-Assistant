"use client";

import { useEffect } from "react";
import { Clock3 } from "lucide-react";
import { TradeCountdown } from "@/components/TradeCountdown";
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

  const activeTrades = tradeHistory.filter(
    (trade) => trade.status === "OPEN" && trade.signal !== "WAIT" && trade.signal !== "UNSURE",
  );

  if (activeTrades.length === 0) return null;

  return (
    <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-blue-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Active Paper Trades</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {activeTrades.map((trade) => {
          const duration = trade.tradeDuration || trade.timeframe || "5m";
          const startedAt = trade.paperTradeStartedAt || trade.timestamp;

          return (
            <div key={trade.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-white">{trade.symbol}</div>
                  <div className="text-[10px] text-zinc-500">Chart {trade.timeframe} · Trade {duration}</div>
                </div>
                <span className={`rounded px-2 py-1 text-xs font-bold ${
                  trade.signal === "BUY"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}>
                  {trade.signal}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <div className="text-[10px] text-zinc-500">Entry</div>
                  <div className="font-mono text-xs text-zinc-100">{trade.entryPrice ?? "-"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Target (TP)</div>
                  <div className="font-mono text-xs text-green-400">{trade.takeProfit ?? "-"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Stop Loss (SL)</div>
                  <div className="font-mono text-xs text-red-400">{trade.stopLoss ?? "-"}</div>
                </div>
              </div>

              <TradeCountdown
                startedAt={startedAt}
                duration={duration}
                onComplete={() => {
                  const current = useTradingStore.getState().tradeHistory;
                  useTradingStore.setState({
                    tradeHistory: current.map((item) =>
                      item.id === trade.id && item.status === "OPEN"
                        ? {
                            ...item,
                            status: "CLOSED",
                            paperTradeExpiresAt: startedAt + Date.now() - Date.now() + 0,
                          }
                        : item,
                    ),
                  });
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
