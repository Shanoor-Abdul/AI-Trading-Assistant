"use client";

import { useMobileStore } from "@/store/useMobileStore";
import { Card, CardContent } from "@/components/ui/card";
import { TradeCountdown } from "@/components/TradeCountdown";
import { parseTradeDurationMs } from "@/lib/tradeDuration";

export function MobileHistory() {
  const { tradeHistory } = useMobileStore();

  if (tradeHistory.length === 0) {
    return (
      <div className="text-center p-8 text-zinc-500 text-sm">
        No recent trades. Run an analysis to see history here.
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <h3 className="font-medium text-sm text-zinc-300 px-1">Recent Analysis</h3>
      {tradeHistory.map((trade) => {
        const duration = trade.tradeDuration || trade.timeframe || "5m";
        const startedAt = trade.paperTradeStartedAt || trade.timestamp;
        const isActive = trade.status === "OPEN" && trade.signal !== "WAIT" && trade.signal !== "UNSURE";
        const expiresAt = trade.paperTradeExpiresAt || startedAt + parseTradeDurationMs(duration);

        return (
          <Card key={trade.id} className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">{trade.symbol}</span>
                    <span className="text-xs text-zinc-500">Chart {trade.timeframe}</span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="mx-1">·</span>
                    Trade {duration}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`px-2 py-1 rounded text-xs font-bold inline-block mb-1 ${
                    trade.signal === 'BUY' ? 'bg-green-500/20 text-green-400' :
                    trade.signal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {trade.signal}
                  </span>
                  <div className={`text-[10px] font-bold uppercase ${
                    trade.status === 'WON' ? 'text-green-400' :
                    trade.status === 'LOST' ? 'text-red-400' :
                    trade.status === 'SKIPPED' ? 'text-zinc-500' : 'text-blue-400'
                  }`}>
                    {trade.status}
                  </div>
                </div>
              </div>

              {(trade.signal === "BUY" || trade.signal === "SELL") && (
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-800 bg-black/20 p-3">
                  <div>
                    <div className="text-[10px] text-zinc-500">Entry</div>
                    <div className="font-mono text-sm text-zinc-100">{trade.entryPrice ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">Target (TP)</div>
                    <div className="font-mono text-sm text-green-400">{trade.takeProfit ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">Stop Loss (SL)</div>
                    <div className="font-mono text-sm text-red-400">{trade.stopLoss ?? "-"}</div>
                  </div>
                </div>
              )}

              {isActive && (
                <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">Trade Timer</div>
                  <TradeCountdown
                    startedAt={startedAt}
                    duration={duration}
                    compact
                  />
                </div>
              )}

              {trade.status !== "OPEN" && trade.paperTradeExpiresAt && (
                <div className="flex items-center justify-between border-t border-zinc-800 pt-2 text-[10px] text-zinc-500">
                  <span>Trade ended</span>
                  <span>{new Date(trade.paperTradeExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
