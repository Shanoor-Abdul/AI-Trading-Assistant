import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTradingStore } from "@/store/useTradingStore";
import { calculateExpectedFrames, PROGRESSIVE_BATCH_SIZE } from "@/lib/observation/calculation";
import { createObservationSessionKey } from "@/lib/observation/session";
import { selectObservationFrames } from "@/lib/observation/selection";

function timeframeToMs(value: string, fallback = 300_000): number {
  const match = value.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return Math.max(1_000, amount * multiplier);
}

export function useDashboardCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzeRef = useRef<() => Promise<void>>(async () => {});
  const [timeSinceLastFrame, setTimeSinceLastFrame] = useState(0);
  const [timeUntilNextFrame, setTimeUntilNextFrame] = useState(0);

  const {
    stream,
    setStream,
    isAnalyzing,
    setIsAnalyzing,
    isAutoScan,
    marketDataMode,
    observationFrequency,
    timeframe,
    tradeDuration,
    symbol,
    platform,
    selectedProvider,
    selectedModel,
    selectedStrategies,
    visibleIndicators,
    activeConnectionId,
    observations,
  } = useTradingStore();

  const captureFrame = useCallback((quality = 0.7): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  const analyzeSnapshot = useCallback(async () => {
    const state = useTradingStore.getState();
    if (!state.stream || state.isFetchingAnalysis) return;

    const imageBase64 = captureFrame(0.8);
    if (!imageBase64) return;

    state.setLastImageBase64(imageBase64);
    state.setIsFetchingAnalysis(true);

    try {
      const current = useTradingStore.getState();
      const body: Record<string, unknown> = {
        symbol: current.symbol,
        timeframe: current.timeframe,
        provider: current.selectedProvider,
        model: current.selectedModel,
        selectedStrategies: current.selectedStrategies,
        marketDataMode: current.marketDataMode,
        tradingMode: current.tradingMode,
        visibleIndicators: current.visibleIndicators,
        activeConnectionId: current.activeConnectionId,
        isProgressive: false,
        progressiveState: current.progressiveAnalyses,
      };

      if (current.marketDataMode === "visual_only") {
        current.addObservation(imageBase64);
        const next = useTradingStore.getState();
        const selected = selectObservationFrames(next.observations, 10);
        body.platform = next.platform;
        body.tradeDuration = next.tradeDuration;
        body.screenshots = selected.map((observation) => ({
          timestamp: new Date(observation.timestamp).toISOString(),
          mimeType: "image/jpeg",
          base64: observation.imageBase64,
        }));
      } else {
        body.imageBase64 = imageBase64;
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        useTradingStore.getState().incrementFailCount();
        toast.error("Failed to analyze the chart.");
        return;
      }

      useTradingStore.getState().resetFailCount();
      const data = await response.json();

      if (data.marketDataStatus === "fallback") {
        toast("Live data not found. Falling back to visual analysis.", { icon: "👀" });
      }

      useTradingStore.getState().updateAnalysis({
        trend: data.trend,
        signal: data.signal,
        confidence: data.confidence,
        explanation: data.explanation,
        entryPrice: data.entryPrice,
        takeProfit: data.takeProfit,
        stopLoss: data.stopLoss,
        recommendedTimeframe: data.recommendedTimeframe,
        requestedIndicators: data.requestedIndicators,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
      });
      toast.success("Analysis complete!");
    } catch (error) {
      useTradingStore.getState().incrementFailCount();
      console.error("Analysis error:", error);
      toast.error("API Error: Failed to analyze the chart.");
    } finally {
      useTradingStore.getState().setIsFetchingAnalysis(false);
    }
  }, [captureFrame]);

  analyzeRef.current = analyzeSnapshot;

  useEffect(() => {
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!stream || marketDataMode !== "visual_only" || !isAnalyzing) return;

    const captureObservation = () => {
      const image = captureFrame(0.7);
      if (image) useTradingStore.getState().addObservation(image);
    };

    const initialTimer = window.setTimeout(captureObservation, 2_000);
    const intervalTimer = window.setInterval(captureObservation, observationFrequency * 1_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, [stream, marketDataMode, isAnalyzing, observationFrequency, captureFrame]);

  useEffect(() => {
    if (!stream || marketDataMode !== "visual_only" || !isAnalyzing) return;

    const timer = window.setInterval(() => {
      const last = useTradingStore.getState().lastObservationTimestamp;
      if (!last) {
        setTimeSinceLastFrame(0);
        setTimeUntilNextFrame(observationFrequency);
        return;
      }
      const elapsed = (Date.now() - last) / 1_000;
      setTimeSinceLastFrame(elapsed);
      setTimeUntilNextFrame(Math.max(0, observationFrequency - elapsed));
    }, 250);

    return () => window.clearInterval(timer);
  }, [stream, marketDataMode, isAnalyzing, observationFrequency]);

  useEffect(() => {
    if (!stream || marketDataMode !== "visual_only") return;

    const state = useTradingStore.getState();
    if (state.isProgressiveAnalyzing || state.isFetchingAnalysis) return;

    const analyzedCount = state.lastAnalyzedObservationIndex >= 0
      ? state.lastAnalyzedObservationIndex + 1
      : 0;
    const pending = state.observations.length - analyzedCount;
    if (pending < PROGRESSIVE_BATCH_SIZE) return;

    const startIndex = analyzedCount;
    const endIndex = startIndex + PROGRESSIVE_BATCH_SIZE - 1;
    const frames = state.observations.slice(startIndex, endIndex + 1);
    if (frames.length !== PROGRESSIVE_BATCH_SIZE) return;

    let cancelled = false;
    const run = async () => {
      useTradingStore.getState().setIsProgressiveAnalyzing(true);
      try {
        const current = useTradingStore.getState();
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: current.symbol,
            timeframe: current.timeframe,
            platform: current.platform,
            tradeDuration: current.tradeDuration,
            provider: current.selectedProvider,
            model: current.selectedModel,
            marketDataMode: current.marketDataMode,
            visibleIndicators: current.visibleIndicators,
            selectedStrategies: current.selectedStrategies,
            activeConnectionId: current.activeConnectionId,
            isProgressive: true,
            progressiveState: current.progressiveAnalyses,
            screenshots: frames.map((observation) => ({
              base64: observation.imageBase64,
              mimeType: "image/jpeg",
            })),
          }),
        });

        if (!response.ok) throw new Error(`Progressive analysis failed: ${response.status}`);
        const data = await response.json();
        if (cancelled || !data.marketState) return;

        useTradingStore.getState().addProgressiveAnalysis({
          analysisId: data.analysisId || crypto.randomUUID(),
          batchId: current.currentBatchId,
          timestamp: new Date().toISOString(),
          frameStart: startIndex + 1,
          frameEnd: endIndex + 1,
          trend: data.trend || "Unknown",
          momentum: data.momentum || "Unknown",
          marketState: data.marketState,
          candlestickBehavior: data.candlestickBehavior || "Unknown",
          indicatorState: data.indicatorState || {},
          strategyConsensus: data.strategyConsensus || "Unknown",
          strategyConflicts: data.strategyConflicts || [],
          changesFromPrevious: data.changesFromPrevious || "None",
          confidence: data.confidence || 0,
        });
        useTradingStore.getState().setLastAnalyzedObservationIndex(endIndex);
        useTradingStore.getState().incrementBatchId();
      } catch (error) {
        console.error("Progressive analysis failed:", error);
      } finally {
        if (!cancelled) useTradingStore.getState().setIsProgressiveAnalyzing(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [observations.length, stream, marketDataMode]);

  useEffect(() => {
    if (marketDataMode !== "visual_only") return;

    const key = createObservationSessionKey({
      platform,
      symbol,
      timeframe,
      tradeDuration,
      selectedStrategies,
      visibleIndicators,
      marketDataMode,
      activeConnectionId,
      provider: selectedProvider,
      model: selectedModel,
      observationFrequency,
    });

    const state = useTradingStore.getState();
    if (state.analysisSessionKey !== null && state.analysisSessionKey !== key) {
      state.clearProgressiveSession();
    }
    state.setAnalysisSessionKey(key);
  }, [
    platform,
    symbol,
    timeframe,
    tradeDuration,
    selectedStrategies,
    visibleIndicators,
    marketDataMode,
    activeConnectionId,
    selectedProvider,
    selectedModel,
    observationFrequency,
  ]);

  useEffect(() => {
    if (!isAutoScan || !isAnalyzing || !stream) return;
    const timer = window.setInterval(() => {
      void analyzeRef.current();
    }, timeframeToMs(timeframe));
    return () => window.clearInterval(timer);
  }, [isAutoScan, isAnalyzing, stream, timeframe]);

  const startCapture = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });
      setStream(mediaStream);
      setIsAnalyzing(true);

      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          mediaStream.getTracks().forEach((item) => item.stop());
          setStream(null);
          setIsAnalyzing(false);
        };
      }
    } catch (error) {
      console.error("Screen capture cancelled or failed:", error);
    }
  }, [setIsAnalyzing, setStream]);

  const stopCapture = useCallback(() => {
    useTradingStore.getState().stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setIsAnalyzing(false);
  }, [setIsAnalyzing, setStream]);

  const currentState = useTradingStore.getState();
  const expectedFrames = marketDataMode === "visual_only"
    ? calculateExpectedFrames(timeframe, tradeDuration, observationFrequency)
    : 0;
  const totalFramesCaptured = currentState.totalFramesCaptured;
  const analyzedCount = currentState.lastAnalyzedObservationIndex >= 0
    ? currentState.lastAnalyzedObservationIndex + 1
    : 0;
  const currentBatchFrames = Math.max(0, observations.length - analyzedCount);

  return {
    videoRef,
    canvasRef,
    captureFrame,
    analyzeSnapshot,
    startCapture,
    stopCapture,
    timeSinceLastFrame,
    timeUntilNextFrame,
    expectedFrames,
    totalFramesCaptured,
    currentBatchFrames,
  };
}
