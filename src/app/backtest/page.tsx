"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTradingStore } from "@/store/useTradingStore";
import { Play, Activity } from "lucide-react";
import { toast } from "sonner";

export default function BacktestPage() {
  const { symbol, timeframe, selectedStrategies, selectedProvider, selectedModel } = useTradingStore();
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleRunBacktest = async () => {
    setIsRunning(true);
    setResults(null);
    toast.info("Initializing Backtest Engine. Simulating historical AI logic...");

    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol, timeframe, selectedStrategies, provider: selectedProvider, model: selectedModel, days: 30
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        setResults(data);
        toast.success("Backtest simulation complete!");
      } else {
        toast.error(data.error || "Failed to run backtest");
      }
    } catch (err) {
      toast.error("Network error during backtest");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-8 flex flex-col gap-6 w-full max-w-5xl mx-auto text-zinc-200">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Backtesting Engine</h1>
        <p className="text-sm text-zinc-400">Simulate historical market data through the Strategy + AI pipeline.</p>
      </div>

      <Card className="glass-card border-none">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
           <div>
             <span className="text-xs text-zinc-400 block mb-1">Symbol</span>
             <Input value={symbol} disabled className="bg-zinc-900/50" />
           </div>
           <div>
             <span className="text-xs text-zinc-400 block mb-1">Timeframe</span>
             <Input value={timeframe} disabled className="bg-zinc-900/50" />
           </div>
           <div>
             <span className="text-xs text-zinc-400 block mb-1">Strategy</span>
             <Input value={selectedStrategies?.join(", ")} disabled className="bg-zinc-900/50" />
           </div>
           <Button onClick={handleRunBacktest} disabled={isRunning} className="bg-purple-600 hover:bg-purple-700 w-full">
             {isRunning ? <Activity className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
             {isRunning ? "Simulating..." : "Run Backtest"}
           </Button>
        </CardContent>
      </Card>

      {results && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
              <span className="text-sm text-zinc-400 font-medium">Win Rate</span>
              <span className="text-4xl font-bold text-white">{results.winRate}%</span>
            </Card>
            <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
              <span className="text-sm text-zinc-400 font-medium">Trades Evaluated</span>
              <span className="text-4xl font-bold text-white">{results.tradesEvaluated}</span>
            </Card>
            <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
              <span className="text-sm text-zinc-400 font-medium">Ending Capital</span>
              <span className={`text-4xl font-bold ${results.finalCapital > 10000 ? 'text-green-400' : 'text-red-400'}`}>
                ${results.finalCapital.toFixed(2)}
              </span>
            </Card>
          </div>

          <Card className="glass-card border-none mt-4">
            <CardHeader>
              <CardTitle>Simulated Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Signal</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">PnL</th>
                    <th className="px-4 py-3">MFE / MAE</th>
                  </tr>
                </thead>
                <tbody>
                  {results.trades.map((t: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="px-4 py-3">{new Date(t.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold">{t.signal}</td>
                      <td className={`px-4 py-3 font-bold ${t.outcome === 'WON' ? 'text-green-400' : 'text-red-400'}`}>{t.outcome}</td>
                      <td className={`px-4 py-3 font-mono ${t.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>{t.pnl.toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="text-green-400">+{t.mfe.toFixed(2)}</span> / <span className="text-red-400">-{t.mae.toFixed(2)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
