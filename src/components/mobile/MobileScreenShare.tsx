"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MonitorUp, Square, Timer, CircleAlert, Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMobileScreenShare } from "@/hooks/useMobileScreenShare";
import { useMobileStore } from "@/store/useMobileStore";

export type MobileScreenShareProps = {
  frequencySeconds?: number;
};

export function MobileScreenShare({ frequencySeconds = 15 }: MobileScreenShareProps) {
  const {
    platform,
    symbol,
    tradeDuration,
    primaryTimeframe,
    selectedStrategies,
    selectedProvider,
    selectedModel,
    visibleIndicators,
    previousAnalysisData,
    isAnalyzing,
    setField,
  } = useMobileStore();

  const [sessionReady, setSessionReady] = useState(false);

  const sessionKey = useMemo(
    () => JSON.stringify({
      platform,
      symbol: symbol.trim().toUpperCase(),
      primaryTimeframe: primaryTimeframe.trim(),
      tradeDuration: tradeDuration.trim(),
      selectedStrategies: [...selectedStrategies].sort(),
      visibleIndicators: [...visibleIndicators].sort(),
      selectedProvider,
      selectedModel,
    }),
    [platform, symbol, primaryTimeframe, tradeDuration, selectedStrategies, visibleIndicators, selectedProvider, selectedModel],
  );

  const {
    videoRef,
    canvasRef,
    observations,
    isSharing,
    isSupported,
    error,
    secondsUntilNextFrame,
    startSharing,
    stopSharing,
    clearObservations,
    maxObservations,
  } = useMobileScreenShare();

  useEffect(() => {
    if (!sessionReady) {
      setSessionReady(true);
      return;
    }

    clearObservations();
    setField("previousAnalysisData", null);
    setField("analysisResult", null);
    setField("previewImageBase64", null);
    toast("Mobile analysis session reset because the trading configuration changed.");
  }, [sessionKey, clearObservations, setField, sessionReady]);

  const handleAnalyzeCapturedFrames = async () => {
    if (observations.length === 0) {
      toast.error("Capture at least one screen frame before analysis.");
      return;
    }

    setField("isAnalyzing", true);

    try {
      const latest = observations[observations.length - 1];
      setField("previewImageBase64", latest.imageBase64);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          timeframe: primaryTimeframe.trim() || "5m",
          platform: platform.trim() || "Trading Platform",
          tradeDuration: tradeDuration.trim() || "5m",
          provider: selectedProvider,
          model: selectedModel,
          selectedStrategies,
          visibleIndicators,
          marketDataMode: "visual_only",
          screenshots: observations.map((observation) => ({
            timestamp: new Date(observation.timestamp).toISOString(),
            mimeType: "image/jpeg",
            base64: observation.imageBase64,
          })),
          progressiveState: previousAnalysisData ? [previousAnalysisData] : [],
          isProgressive: false,
          previousData: previousAnalysisData ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("AI analysis request failed");
      }

      const data = await response.json();

      setField("analysisResult", data);
      setField("previousAnalysisData", data);
      setField("pendingUnsureRequest", data.signal === "UNSURE");
      setField("requestedTimeframe", data.requiredTimeframe ?? null);

      const currentHistory = useMobileStore.getState().tradeHistory;
      const newTrade = {
        id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 9),
        timestamp: Date.now(),
        symbol,
        timeframe: primaryTimeframe,
        trend: data.trend,
        signal: data.signal,
        confidence: data.confidence,
        recommendedTimeframe: data.recommendedTimeframe,
        entryPrice: data.entryPrice,
        stopLoss: data.stopLoss,
        takeProfit: data.takeProfit,
        explanation: data.explanation,
        status: data.signal === "WAIT" || data.signal === "NO_TRADE" ? "SKIPPED" : "OPEN",
      };
      setField("tradeHistory", [newTrade, ...currentHistory]);

      toast.success(`Analysis complete: ${data.signal}`);
    } catch (cause) {
      console.error("Mobile screen-share analysis error:", cause);
      toast.error("Failed to analyze the captured screen.");
    } finally {
      setField("isAnalyzing", false);
    }
  };

  const progress = Math.min(100, ((frequencySeconds - secondsUntilNextFrame) / frequencySeconds) * 100);

  return (
    <Card className="border-zinc-800 bg-zinc-950/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Plan B — Live Screen Share</p>
            <p className="text-[11px] text-zinc-500">Capture the trading screen; AI runs only when you press Analyze.</p>
          </div>
          <span className={`text-[10px] font-semibold ${isSharing ? "text-green-400" : "text-zinc-500"}`}>
            {isSharing ? "● ACTIVE" : "○ OFF"}
          </span>
        </div>

        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        {!isSupported && (
          <div className="flex gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-300">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span>Screen sharing is not available in this browser. Screenshot upload remains available.</span>
          </div>
        )}

        {error && <p className="text-xs text-orange-300">{error}</p>}

        {isSharing && (
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-zinc-400"><Timer className="h-3 w-3" /> Next frame</span>
              <span className="font-mono text-zinc-200">{Math.ceil(secondsUntilNextFrame)}s</span>
            </div>
            <Progress value={progress} className="h-1 bg-zinc-800" />
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Frames: {observations.length} / {maxObservations}</span>
              <span>Every {frequencySeconds}s</span>
            </div>
          </div>
        )}

        {previousAnalysisData && (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Previous analysis</span>
              <span className="font-semibold text-zinc-200">
                {previousAnalysisData.signal} · {previousAnalysisData.confidence}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">The next manual analysis will compare the new screen sequence with this result.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {!isSharing ? (
            <Button onClick={() => void startSharing()} disabled={!isSupported}>
              <MonitorUp className="mr-2 h-4 w-4" /> Start Share
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopSharing}>
              <Square className="mr-2 h-4 w-4" /> Stop Share
            </Button>
          )}
          <Button variant="outline" onClick={clearObservations} disabled={observations.length === 0}>
            Clear Frames
          </Button>
        </div>

        <Button
          className="w-full"
          onClick={() => void handleAnalyzeCapturedFrames()}
          disabled={isAnalyzing || observations.length === 0}
        >
          {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
          {isAnalyzing ? "Analyzing..." : `Run AI Analysis (${observations.length} frames)`}
        </Button>
      </CardContent>
    </Card>
  );
}
