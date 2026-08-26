"use client";

import { useRef } from "react";
import { useMobileStore } from "@/store/useMobileStore";
import { ImageStore } from "@/lib/utils/imageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Activity, Camera, Loader2, RefreshCw, AlertTriangle, Info, Layers, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { MobileResultCard } from "@/components/mobile/MobileResultCard";
import { MobileHistory } from "@/components/mobile/MobileHistory";
import { getVisionModelsByProvider } from "@/config/models";
import { LogoutButton } from "@/components/LogoutButton";
import { MobileMultiSelect } from "@/components/mobile/MobileMultiSelect";

const STRATEGY_OPTIONS = ["Auto (AI Selection)", "Scalping", "Trend Following", "Breakout", "Mean Reversion", "SMC", "ICT", "Swing Trading"];
const INDICATOR_OPTIONS = ["RSI", "MACD", "Bollinger Bands", "EMA 20", "EMA 50", "EMA 200", "Volume", "Stochastic", "VWAP", "ATR"];

export default function MobileDashboardV2() {
  const { platform, symbol, tradeDuration, primaryTimeframe, selectedStrategies, selectedProvider, selectedModel, visibleIndicators, previewImageBase64, previewImageId, isAnalyzing, analysisResult, pendingUnsureRequest, requestedTimeframe, setField, clearAnalysis } = useMobileStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleStrategy = (value: string) => setField("selectedStrategies", selectedStrategies.includes(value) ? selectedStrategies.filter((item) => item !== value) : [...selectedStrategies, value]);
  const toggleIndicator = (value: string) => setField("visibleIndicators", visibleIndicators.includes(value) ? visibleIndicators.filter((item) => item !== value) : [...visibleIndicators, value]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        let width = img.width;
        let height = img.height;
        // Keep enough resolution for small candle bodies, wicks and indicator labels.
        // Do not upscale screenshots that are already smaller than this limit.
        const MAX_SIZE = 2560;
        const JPEG_QUALITY = 0.9;
        if (width > height && width > MAX_SIZE) { height = Math.round(height * MAX_SIZE / width); width = MAX_SIZE; }
        else if (height >= width && height > MAX_SIZE) { width = Math.round(width * MAX_SIZE / height); height = MAX_SIZE; }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        const imageId = crypto.randomUUID();
        await ImageStore.saveImage(imageId, base64);
        setField("previewImageBase64", base64);
        setField("previewImageId", imageId);
      };
      img.src = String(event.target?.result ?? "");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleAnalyze = async () => {
    setField("isAnalyzing", true);
    try {
      const state = useMobileStore.getState();
      const storedImage = state.previewImageId ? await ImageStore.getImage(state.previewImageId) : null;
      const imageBase64 = storedImage || state.previewImageBase64;
      if (!imageBase64) { toast.error("Upload at least one chart screenshot first."); return; }
      const payload = {
        imageBase64,
        platform: platform?.trim() || "Unknown",
        symbol: symbol?.trim().toUpperCase(),
        timeframe: primaryTimeframe?.trim() || "5m",
        tradeDuration: tradeDuration?.trim() || "5m",
        provider: selectedProvider,
        model: selectedModel,
        selectedStrategies,
        visibleIndicators,
      };
      toast.loading("Analyzing chart...");
      const res = await fetch("/api/mobile-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      toast.dismiss();
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Mobile analysis API request failed");
      if (data.signal === "UNSURE" && data.requiredTimeframe) {
        setField("pendingUnsureRequest", true); setField("requestedTimeframe", data.requiredTimeframe); setField("previousAnalysisData", data); toast("Additional confirmation needed."); return;
      }
      setField("analysisResult", data); setField("pendingUnsureRequest", false); setField("requestedTimeframe", null); setField("previousAnalysisData", data);
      const newTrade = { id: crypto.randomUUID(), timestamp: Date.now(), symbol, timeframe: primaryTimeframe, tradeDuration, trend: data.trend, signal: data.signal, confidence: data.confidence, recommendedTimeframe: data.recommendedTimeframe, entryPrice: data.entryPrice, stopLoss: data.stopLoss, takeProfit: data.takeProfit, explanation: data.explanation, status: data.signal === "WAIT" || data.signal === "NO_TRADE" ? "SKIPPED" : "OPEN" };
      const history = useMobileStore.getState().tradeHistory;
      setField("tradeHistory", [newTrade, ...history]);
      toast.success("Mobile analysis complete.");
    } catch (error: any) {
      toast.dismiss(); console.error("[Mobile UI] Analysis failed:", error); toast.error(error?.message || "Failed to analyze chart.");
    } finally { setField("isAnalyzing", false); }
  };

  const renderModelGroup = (provider: "gemini" | "groq" | "openai" | "openrouter" | "huggingface" | "anthropic", label: string) => (
    <SelectGroup>
      <SelectLabel className="text-zinc-500 text-xs mt-2">{label}</SelectLabel>
      {getVisionModelsByProvider(provider).map((model) => (
        <SelectItem key={model.id} value={`${provider}:${model.id}`}>
          {model.name}
        </SelectItem>
      ))}
    </SelectGroup>
  );

  return (
    <TooltipProvider>
      <main className="p-4 flex flex-col gap-6 max-w-md mx-auto">
        <header className="flex justify-between items-center mb-2"><div><h1 className="text-xl font-bold tracking-tight">AI Assistant</h1><p className="text-xs text-zinc-400">Mobile Scanner</p></div><LogoutButton /></header>
        {!pendingUnsureRequest ? <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-zinc-400">Platform</Label><Input value={platform} onChange={(e) => setField("platform", e.target.value)} className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center" placeholder="e.g. Binance" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-zinc-400">Currency / Asset</Label><Input value={symbol} onChange={(e) => setField("symbol", e.target.value.toUpperCase())} className="h-9 bg-zinc-900 border-zinc-800 text-sm font-medium text-center" placeholder="e.g. BTC/USDT" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-zinc-400">Chart TF</Label><Input value={primaryTimeframe} onChange={(e) => setField("primaryTimeframe", e.target.value)} className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center" placeholder="e.g. 5m" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-zinc-400">Trade TF</Label><Input value={tradeDuration} onChange={(e) => setField("tradeDuration", e.target.value)} className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center" placeholder="e.g. 5m" /></div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1"><Label className="text-xs text-zinc-400">AI Model</Label><Tooltip><TooltipTrigger><Info className="w-3 h-3 text-zinc-500" /></TooltipTrigger><TooltipContent><p>One selected vision model performs extraction and final analysis.</p></TooltipContent></Tooltip></div>
            <Select value={`${selectedProvider}:${selectedModel}`} onValueChange={(val) => { if (!val) return; const idx = val.indexOf(":"); setField("selectedProvider", val.substring(0, idx)); setField("selectedModel", val.substring(idx + 1)); }}>
              <SelectTrigger className="h-9 w-full bg-zinc-900 border-zinc-800 text-sm"><SelectValue placeholder="AI Model" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {renderModelGroup("gemini", "Google")}
                {renderModelGroup("groq", "Groq")}
                {renderModelGroup("openai", "OpenAI")}
                {renderModelGroup("openrouter", "OpenRouter")}
                {renderModelGroup("huggingface", "Hugging Face")}
                {renderModelGroup("anthropic", "Anthropic (Native)")}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5"><Label className="text-xs text-zinc-400">Selected Strategies</Label><MobileMultiSelect selected={selectedStrategies} options={STRATEGY_OPTIONS} onChange={toggleStrategy} placeholder="Add Strategy" icon={<Target className="w-4 h-4 mr-2 text-zinc-400" />} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-zinc-400">Visible Indicators</Label><MobileMultiSelect selected={visibleIndicators} options={INDICATOR_OPTIONS} onChange={toggleIndicator} placeholder="Add Indicator" icon={<Layers className="w-4 h-4 mr-2 text-zinc-400" />} /></div>
        </section> : <section className="bg-orange-500/10 border border-orange-500/50 p-4 rounded-lg space-y-3"><div className="flex items-start gap-2"><AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" /><div><h3 className="font-bold text-orange-400 text-sm">Confirmation Needed</h3><p className="text-xs text-orange-200/80 mt-1">Additional confirmation is required for {requestedTimeframe}.</p></div></div><Button variant="outline" className="w-full text-xs h-8 border-orange-500/30" onClick={clearAnalysis}>Cancel Analysis</Button></section>}

        {!analysisResult && <section className="space-y-4"><input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />{!previewImageBase64 ? <Button onClick={() => fileInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 flex flex-col gap-2 text-zinc-400" variant="outline"><Camera className="w-6 h-6" /><span>Upload Chart Screenshot</span></Button> : <div className="space-y-3"><div className="relative rounded-lg overflow-hidden border border-zinc-800 h-40"><img src={previewImageBase64} alt="Chart Preview" className="w-full h-full object-cover" /><Button size="sm" variant="secondary" className="absolute top-2 right-2 h-7 text-xs bg-black/60 backdrop-blur" onClick={() => fileInputRef.current?.click()}><RefreshCw className="w-3 h-3 mr-1" /> Replace</Button></div><Button onClick={handleAnalyze} disabled={isAnalyzing || !previewImageId} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-12 text-base shadow-[0_0_20px_rgba(147,51,234,0.3)]">{isAnalyzing ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Analyzing...</> : <><Activity className="w-5 h-5 mr-2" /> Run AI Analysis</>}</Button></div>}</section>}

        {analysisResult && <div className="space-y-4"><MobileResultCard /><div className="flex gap-2"><Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => toast.success("Paper trade started!")}>Start Paper Trade</Button><Button variant="outline" className="flex-1" onClick={clearAnalysis}>Scan Again</Button></div></div>}
        <MobileHistory />
      </main>
    </TooltipProvider>
  );
}
