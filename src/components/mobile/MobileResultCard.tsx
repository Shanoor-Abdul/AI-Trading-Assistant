import { useMobileStore } from "@/store/useMobileStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function MobileResultCard() {
  const { analysisResult } = useMobileStore();

  if (!analysisResult) return null;

  return (
    <Card className="glass-card border-none mt-4 animate-in fade-in-0 slide-in-from-bottom-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">AI Analysis Result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Trend & Signal */}
        <div className="flex justify-between items-center bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
          <div>
            <div className="text-xs text-zinc-400 mb-1">Trend</div>
            <div className="flex items-center gap-2 font-bold">
              {analysisResult.trend === 'Bullish' ? <TrendingUp className="text-green-400 w-4 h-4" /> :
               analysisResult.trend === 'Bearish' ? <TrendingDown className="text-red-400 w-4 h-4" /> : 
               <Minus className="text-zinc-400 w-4 h-4" />}
              {analysisResult.trend}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-400 mb-1">Signal</div>
            <div className={`text-xl font-black ${
              analysisResult.signal === 'BUY' ? 'text-green-500' :
              analysisResult.signal === 'SELL' ? 'text-red-500' : 
              analysisResult.signal === 'UNSURE' ? 'text-orange-500' : 'text-yellow-500'
            }`}>
              {analysisResult.signal}
            </div>
          </div>
        </div>

        {/* Confidence */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-zinc-400">Confidence</span>
            <span className="text-xs font-mono">{analysisResult.confidence}%</span>
          </div>
          <Progress value={analysisResult.confidence} className="h-1.5 bg-zinc-800" />
        </div>

        {/* Targets */}
        {(analysisResult.signal === 'BUY' || analysisResult.signal === 'SELL') && (
          <div className="grid grid-cols-3 gap-2 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
            <div>
              <div className="text-[10px] text-zinc-500">Entry</div>
              <div className="font-mono text-sm text-zinc-200">{analysisResult.entryPrice || "-"}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500">Target (TP)</div>
              <div className="font-mono text-sm text-green-400">{analysisResult.takeProfit || "-"}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500">Stop Loss (SL)</div>
              <div className="font-mono text-sm text-red-400">{analysisResult.stopLoss || "-"}</div>
            </div>
          </div>
        )}

        {/* Explanation */}
        <div>
          <div className="text-xs text-zinc-400 mb-1">Reasoning</div>
          <p className="text-xs text-zinc-300 bg-black/40 p-3 rounded-md border border-white/5 leading-relaxed">
            {analysisResult.explanation}
          </p>
        </div>
        
      </CardContent>
    </Card>
  );
}
