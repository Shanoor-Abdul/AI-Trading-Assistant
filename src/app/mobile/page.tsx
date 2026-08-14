"use client";

import { useRef } from "react";
import { useMobileStore } from "@/store/useMobileStore";
import { selectMobileAnalysisFrames } from "@/lib/mobile/visualHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Activity, Camera, Loader2, RefreshCw, AlertTriangle, Info, Layers, Target, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { MobileResultCard } from "@/components/mobile/MobileResultCard";
import { MobileHistory } from "@/components/mobile/MobileHistory";
import { getModelsByProvider } from "@/config/models";
import { LogoutButton } from "@/components/LogoutButton";

const STRATEGIES = ["Scalping", "Trend Following", "Breakout", "Mean Reversion", "SMC", "ICT", "Swing Trading"];
const INDICATORS = ["RSI", "MACD", "Bollinger Bands", "EMA 20", "EMA 50", "EMA 200", "Volume", "Stochastic", "VWAP", "ATR"];

export default function MobileDashboard() {
  const {
    platform, symbol, tradeDuration, primaryTimeframe, confirmationTimeframe,
    selectedStrategies, selectedProvider, selectedModel, visibleIndicators,
    previewImageBase64, visualHistory, isAnalyzing, analysisResult,
    pendingUnsureRequest, requestedTimeframe, previousAnalysisData,
    setField, addVisualObservation, clearVisualHistory, clearAnalysis,
  } = useMobileStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetContext = <K extends keyof ReturnType<typeof useMobileStore>>(field: K, value: ReturnType<typeof useMobileStore>[K]) => {
    clearAnalysis();
    setField(field, value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxSize = 1920;

        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, width, height);
        addVisualObservation(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = String(event.target?.result ?? "");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleAnalyze = async () => {
    const frames = selectMobileAnalysisFrames(visualHistory);
    if (frames.length === 0) {
      toast.error("Upload at least one chart screenshot first.");
      return;
    }

    setField("isAnalyzing", true);

    try {
      const screenshots = frames.map((frame) => ({
        timeframe: frame.timeframe,
        mimeType: "image/jpeg" as const,
        base64: frame.base64,
      }));

      const payload = {
        imageBase64: frames[frames.length - 1].base64,
        screenshots,
        platform: platform.trim(),
        symbol: symbol.trim().toUpperCase(),
        timeframe: (pendingUnsureRequest && requestedTimeframe ? requestedTimeframe : primaryTimeframe).trim(),
        tradeDuration: tradeDuration.trim(),
        confirmationTimeframe: confirmationTimeframe.trim(),
        provider: selectedProvider,
        model: selectedModel,
        selectedStrategies,
        visibleIndicators,
        marketDataMode: "visual_only",
        previousData: previousAnalysisData ?? undefined,
      };

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("API request failed");
      const data = await res.json();

      if (data.signal === "UNSURE" && data.requiredTimeframe) {
        setField("pendingUnsureRequest", true);
        setField("requestedTimeframe", data.requiredTimeframe);
        setField("previousAnalysisData", data);
        toast("Additional confirmation needed.");
        return;
      }

      setField("analysisResult", data);
      setField("pendingUnsureRequest", false);
      setField("requestedTimeframe", null);
      setField("previousAnalysisData", data);

      const newTrade = {
        id: crypto.randomUUID(),
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

      const history = useMobileStore.getState().tradeHistory;
      setField("tradeHistory", [newTrade, ...history]);
      toast.success(`Analysis complete using ${frames.length} frame${frames.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to analyze chart.");
    } finally {
      setField("isAnalyzing", false);
    }
  };

  return (
    <TooltipProvider>
      <main className="p-4 flex flex-col gap-5 max-w-md mx-auto">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI Assistant</h1>
            <p className="text-xs text-zinc-400">Mobile Visual Scanner</p>
          </div>
          <LogoutButton />
        </header>

        {!pendingUnsureRequest && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Platform", platform, "platform", "e.g. Binomo"],
                ["Symbol", symbol, "symbol", "e.g. EUR/USD"],
                ["Chart TF", primaryTimeframe, "primaryTimeframe", "e.g. 5m"],
                ["Duration", tradeDuration, "tradeDuration", "e.g. 5m"],
              ].map(([label, value, field, placeholder]) => (
                <div className="space-y-1.5" key={field}>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-zinc-400">{label}</Label>
                    <Tooltip><TooltipTrigger><Info className="w-3 h-3 text-zinc-500" /></TooltipTrigger><TooltipContent><p>Changing this starts a new visual analysis context.</p></TooltipContent></Tooltip>
                  </div>
                  <Input
                    value={value}
                    onChange={(e) => resetContext(field as keyof ReturnType<typeof useMobileStore>, e.target.value)}
                    placeholder={placeholder}
                    className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">AI Model</Label>
              <Select value={`${selectedProvider}:${selectedModel}`} onValueChange={(value) => {
                const [provider, model] = value.split(":");
                resetContext("selectedProvider", provider);
                setField("selectedModel", model);
              }}>
                <SelectTrigger className="h-9 bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {["gemini", "groq", "openai", "openrouter"].map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{provider}</SelectLabel>
                      {getModelsByProvider(provider).map((model) => <SelectItem key={model.id} value={`${provider}:${model.id}`}>{model.name}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Selected Strategies</Label>
              <Select value="__strategy__" onValueChange={(value) => {
                if (selectedStrategies.includes(value)) resetContext("selectedStrategies", selectedStrategies.filter((item) => item !== value));
                else resetContext("selectedStrategies", [...selectedStrategies, value]);
              }}>
                <SelectTrigger className="h-9 bg-zinc-900 border-zinc-800"><Target className="w-4 h-4 mr-2" /><SelectValue placeholder={selectedStrategies.join(", ") || "Add Strategy"} /></SelectTrigger>
                <SelectContent>{STRATEGIES.map((item) => <SelectItem key={item} value={item}><div className="flex gap-2"><input type="checkbox" checked={selectedStrategies.includes(item)} readOnly />{item}</div></SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Visible Indicators</Label>
              <Select value="__indicator__" onValueChange={(value) => {
                if (visibleIndicators.includes(value)) resetContext("visibleIndicators", visibleIndicators.filter((item) => item !== value));
                else resetContext("visibleIndicators", [...visibleIndicators, value]);
              }}>
                <SelectTrigger className="h-9 bg-zinc-900 border-zinc-800"><Layers className="w-4 h-4 mr-2" /><SelectValue placeholder={visibleIndicators.join(", ") || "Add Indicator"} /></SelectTrigger>
                <SelectContent>{INDICATORS.map((item) => <SelectItem key={item} value={item}><div className="flex gap-2"><input type="checkbox" checked={visibleIndicators.includes(item)} readOnly />{item}</div></SelectItem>)}</SelectContent>
              </Select>
            </div>
          </section>
        )}

        {pendingUnsureRequest && (
          <section className="bg-orange-500/10 border border-orange-500/50 p-4 rounded-lg space-y-3">
            <div className="flex items-start gap-2"><AlertTriangle className="w-5 h-5 text-orange-400" /><div><h3 className="font-bold text-orange-400 text-sm">Confirmation Needed</h3><p className="text-xs text-orange-200/80 mt-1">Upload a {requestedTimeframe} chart screenshot for additional confirmation.</p></div></div>
            <Button variant="outline" className="w-full" onClick={() => clearAnalysis()}>Cancel Analysis</Button>
          </section>
        )}

        <section className="space-y-3">
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <Button onClick={() => fileInputRef.current?.click()} className="w-full h-20 border-2 border-dashed border-zinc-700 bg-zinc-900/50" variant="outline">
            <Camera className="w-5 h-5 mr-2" /> Add Chart Frame
          </Button>

          {previewImageBase64 && <div className="relative rounded-lg overflow-hidden border border-zinc-800 h-44"><img src={previewImageBase64} alt="Current chart" className="w-full h-full object-cover" /><Button size="sm" variant="secondary" className="absolute top-2 right-2 h-7" onClick={() => fileInputRef.current?.click()}><RefreshCw className="w-3 h-3 mr-1" /> Add New</Button></div>}

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
            <div className="flex justify-between text-xs"><span className="text-zinc-400">Visual history</span><span className="font-mono">{visualHistory.length} / 5 frames</span></div>
            <div className="flex gap-1.5 overflow-x-auto">
              {visualHistory.map((frame, index) => <img key={frame.timestamp} src={frame.base64} alt={`Observation ${index + 1}`} className={`w-16 h-12 object-cover rounded border ${index === visualHistory.length - 1 ? "border-purple-500" : "border-zinc-800"}`} />)}
            </div>
            <p className="text-[10px] text-zinc-500">The latest frame is always included. Up to 5 recent frames are sent to the visual model.</p>
          </div>

          {visualHistory.length > 0 && <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={clearVisualHistory}><Trash2 className="w-4 h-4 mr-2" />Clear Frames</Button><Button disabled={isAnalyzing} className="flex-[2] bg-purple-600 hover:bg-purple-700" onClick={handleAnalyze}>{isAnalyzing ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Analyzing {visualHistory.length} frames...</> : <><Activity className="w-5 h-5 mr-2" />Run AI Analysis</>}</Button></div>}
        </section>

        {analysisResult && <div className="space-y-3"><MobileResultCard /><Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => toast.success("Paper trade started!")}>Start Paper Trade</Button><Button variant="outline" className="w-full" onClick={clearAnalysis}>New Visual Session</Button></div>}

        <MobileHistory />
      </main>
    </TooltipProvider>
  );
}
