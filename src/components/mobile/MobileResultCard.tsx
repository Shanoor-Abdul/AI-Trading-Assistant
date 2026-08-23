import { useMobileStore } from "@/store/useMobileStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, ScanSearch } from "lucide-react";

function confidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, n <= 1 ? n * 100 : n)));
}

function displayValue(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" ? String(value) : String(value);
}

export function MobileResultCard() {
  const { analysisResult } = useMobileStore();

  if (!analysisResult) return null;

  const result = analysisResult as any;
  const unified = result.unifiedMarketData || {};
  const indicators = unified.indicators || {};
  const extraction = result.mobilePipeline?.extraction || {};
  const evidence = Array.isArray(extraction.visualEvidence) ? extraction.visualEvidence : [];
  const extractedPrice = unified.currentPrice?.value ?? extraction.currentPrice?.value ?? null;
  const priceConfidence = confidence(unified.currentPrice?.confidence ?? extraction.currentPrice?.confidence);
  const extractionConfidence = confidence(
    result.mobilePipeline?.extractionConfidence ?? unified.extractionConfidence ?? extraction.extractionConfidence,
  );
  const visibleIndicators = Object.entries(indicators).filter(([, value]: any) => value?.visible === true);

  return (
    <Card className="glass-card border-none mt-4 animate-in fade-in-0 slide-in-from-bottom-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">AI Analysis Result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
              analysisResult.signal === 'BUY' || analysisResult.signal === 'STRONG_BUY' ? 'text-green-500' :
              analysisResult.signal === 'SELL' || analysisResult.signal === 'STRONG_SELL' ? 'text-red-500' :
              analysisResult.signal === 'UNSURE' ? 'text-orange-500' : 'text-yellow-500'
            }`}>
              {analysisResult.signal}
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-zinc-400">Analysis Confidence</span>
            <span className="text-xs font-mono">{analysisResult.confidence}%</span>
          </div>
          <Progress value={analysisResult.confidence} className="h-1.5 bg-zinc-800" />
        </div>

        {/* Stage 1 diagnostics are intentionally shown separately from the signal. */}
        {(extractedPrice != null || visibleIndicators.length > 0 || evidence.length > 0 || extractionConfidence > 0) && (
          <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <ScanSearch className="w-4 h-4 text-cyan-400" />
                Visual Extraction
              </div>
              <span className="text-[11px] font-mono text-cyan-300">
                {extractionConfidence}% quality
              </span>
            </div>

            {extractedPrice != null && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400">Current price</span>
                <span className="font-mono text-zinc-100">
                  {extractedPrice}
                  {priceConfidence > 0 && <span className="text-zinc-500 ml-2">{priceConfidence}%</span>}
                </span>
              </div>
            )}

            {visibleIndicators.length > 0 && (
              <div className="space-y-2">
                {visibleIndicators.map(([name, value]: any) => {
                  const exact = displayValue(value?.value);
                  const approximate = displayValue(value?.approximateValue);
                  const state = value?.state && value.state !== "UNKNOWN" ? value.state : null;
                  const zone = value?.zone && value.zone !== "UNKNOWN" ? value.zone : null;
                  const position = value?.position && value.position !== "UNKNOWN" ? value.position : null;
                  const direction = value?.direction && value.direction !== "UNKNOWN" ? value.direction : null;
                  const nearestBand = value?.nearestBand && value.nearestBand !== "UNKNOWN" ? value.nearestBand : null;
                  const width = value?.width && value.width !== "UNKNOWN" ? value.width : null;
                  const c = confidence(value?.confidence);

                  return (
                    <div key={name} className="rounded-md border border-zinc-800 bg-black/20 p-2">
                      <div className="flex justify-between gap-2 text-[11px]">
                        <span className="font-medium text-zinc-200">{name}</span>
                        <span className="text-zinc-500">{c}%</span>
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-[10px] text-zinc-400">
                        {exact != null && <span>value: {exact}</span>}
                        {approximate != null && <span>approx: {approximate}</span>}
                        {state && <span>state: {state}</span>}
                        {zone && <span>zone: {zone}</span>}
                        {direction && <span>direction: {direction}</span>}
                        {position && <span>position: {position}</span>}
                        {nearestBand && <span>nearest: {nearestBand}</span>}
                        {width && <span>width: {width}</span>}
                        {value?.lineRelationship && value.lineRelationship !== "UNKNOWN" && <span>lines: {value.lineRelationship}</span>}
                        {value?.histogramDirection && value.histogramDirection !== "UNKNOWN" && <span>histogram: {value.histogramDirection}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {evidence.length > 0 && (
              <ul className="space-y-1 text-[11px] text-zinc-300">
                {evidence.slice(0, 8).map((item: any, index: number) => (
                  <li key={`${index}-${item}`} className="leading-relaxed">• {item}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(analysisResult.signal === 'BUY' || analysisResult.signal === 'SELL' || analysisResult.signal === 'STRONG_BUY' || analysisResult.signal === 'STRONG_SELL') && (
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
