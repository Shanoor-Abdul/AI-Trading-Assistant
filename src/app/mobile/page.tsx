"use client";

import { useRef, useEffect } from "react";
import { useMobileStore } from "@/store/useMobileStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Activity, Camera, Loader2, RefreshCw, AlertTriangle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { MobileResultCard } from "@/components/mobile/MobileResultCard";
import { MobileHistory } from "@/components/mobile/MobileHistory";
import { AI_MODELS, getModelsByProvider } from "@/config/models";
import { LogoutButton } from "@/components/LogoutButton";

export default function MobileDashboard() {
  const {
    platform, symbol, tradeDuration, primaryTimeframe, confirmationTimeframe,
    strategy,
    selectedProvider,
    selectedModel,
    marketDataMode,
    previewImageBase64,
    isAnalyzing, analysisResult, pendingUnsureRequest, requestedTimeframe,
    previousAnalysisData, setField, clearAnalysis, resetAll
  } = useMobileStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        // Scale down if too large (max 1920px)
        const MAX_SIZE = 1920;
        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
          setField("previewImageBase64", compressedBase64);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!previewImageBase64) {
      toast.error("Please upload a chart screenshot first.");
      return;
    }

    setField("isAnalyzing", true);

    try {
      // Build request payload
      const payload = {
        imageBase64: previewImageBase64,
        platform: platform?.trim() || "OlympTrade",
        symbol: symbol?.trim().toUpperCase(),
        timeframe: (pendingUnsureRequest && requestedTimeframe ? requestedTimeframe : primaryTimeframe)?.trim() || "5m",
        tradeDuration: tradeDuration?.trim(),
        confirmationTimeframe: confirmationTimeframe?.trim(),
        provider: selectedProvider,
        model: selectedModel,
        strategy,
        marketDataMode,
        previousData: pendingUnsureRequest ? previousAnalysisData : undefined
      };

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("API request failed");

      const data = await res.json();

      if (data.marketDataStatus === "fallback") {
        toast("Live data not found for this symbol. Falling back to Visual-Only mode.", {
          icon: "👀",
        });
      }

      if (data.signal === "UNSURE" && data.requiredTimeframe) {
        setField("pendingUnsureRequest", true);
        setField("requestedTimeframe", data.requiredTimeframe);
        setField("previousAnalysisData", data);
        setField("previewImageBase64", null); // Clear image for new upload
        toast("Additional confirmation needed.");
      } else {
        setField("analysisResult", data);
        setField("pendingUnsureRequest", false);
        setField("requestedTimeframe", null);
        
        // Add to history
        const newTrade = {
          id: Math.random().toString(36).substring(2, 9),
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
          status: (data.signal === "WAIT" || data.signal === "NO_TRADE") ? "SKIPPED" : "OPEN"
        };
        const currentHistory = useMobileStore.getState().tradeHistory;
        setField("tradeHistory", [newTrade, ...currentHistory]);
        
        // Clear preview image as requested (to not store base64 permanently)
        setField("previewImageBase64", null);
        toast.success("Analysis complete!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to analyze chart.");
    } finally {
      setField("isAnalyzing", false);
    }
  };

  return (
    <TooltipProvider>
    <main className="p-4 flex flex-col gap-6 max-w-md mx-auto">
      <header className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">AI Assistant</h1>
          <p className="text-xs text-zinc-400">Mobile Scanner</p>
        </div>
        <LogoutButton />
      </header>

      {!pendingUnsureRequest ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-zinc-400">Market Data</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-zinc-500" />
                  </TooltipTrigger>
                  <TooltipContent><p>API fetches from Binance; Visual Only skips CCXT for OTC/Indian Markets.</p></TooltipContent>
                </Tooltip>
              </div>
              <Select 
                value={marketDataMode} 
                onValueChange={val => setField("marketDataMode", val)}
              >
                <SelectTrigger className="h-9 bg-zinc-900 border-zinc-800 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">API Data</SelectItem>
                  <SelectItem value="visual_only">Visual Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {marketDataMode === "visual_only" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-zinc-400">Platform</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent><p>Trading platform being used (e.g. OlympTrade)</p></TooltipContent>
                  </Tooltip>
                </div>
                <Input 
                  value={platform} 
                  onChange={e => setField("platform", e.target.value)} 
                  className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                  placeholder="OlympTrade"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-zinc-400">Symbol</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-zinc-500" />
                  </TooltipTrigger>
                  <TooltipContent><p>Asset ticker pair (e.g. BTCUSDT)</p></TooltipContent>
                </Tooltip>
              </div>
              <Input 
                value={symbol} 
                onChange={e => setField("symbol", e.target.value.toUpperCase())} 
                className="h-9 bg-zinc-900 border-zinc-800 text-sm font-medium text-center"
                placeholder="BTCUSDT"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-zinc-400">Chart TF</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-zinc-500" />
                  </TooltipTrigger>
                  <TooltipContent><p>Primary chart timeframe (e.g. 5m)</p></TooltipContent>
                </Tooltip>
              </div>
              <Input 
                value={primaryTimeframe} 
                onChange={e => setField("primaryTimeframe", e.target.value)} 
                className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                placeholder="5m"
              />
            </div>
            {marketDataMode === "api" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-zinc-400">Confirm TF</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent><p>Secondary timeframe for trend confirmation</p></TooltipContent>
                  </Tooltip>
                </div>
                <Input 
                  value={confirmationTimeframe} 
                  onChange={e => setField("confirmationTimeframe", e.target.value)} 
                  className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                  placeholder="15m"
                />
              </div>
            )}
            {marketDataMode === "visual_only" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-zinc-400">Duration</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent><p>How long the trade should last</p></TooltipContent>
                  </Tooltip>
                </div>
                <Input 
                  value={tradeDuration} 
                  onChange={e => setField("tradeDuration", e.target.value)} 
                  className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                  placeholder="5m"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-zinc-400">AI Model</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 text-zinc-500" />
                </TooltipTrigger>
                <TooltipContent><p>Select the AI provider and model for analysis.</p></TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={`${selectedProvider}:${selectedModel}`}
              onValueChange={(val) => {
                if (!val) return;
                const [provider, model] = val.split(":");
                setField("selectedProvider", provider);
                setField("selectedModel", model);
              }}
            >
              <SelectTrigger className="h-9 bg-zinc-900 border-zinc-800 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectGroup>
                  <SelectLabel className="text-zinc-500 text-xs">Google (Free Tier)</SelectLabel>
                  {getModelsByProvider("gemini").map(m => (
                    <SelectItem key={m.id} value={`gemini:${m.id}`}>{m.name}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-zinc-500 text-xs mt-2">Groq (Free Tier)</SelectLabel>
                  {getModelsByProvider("groq").map(m => (
                    <SelectItem key={m.id} value={`groq:${m.id}`}>{m.name}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-zinc-500 text-xs mt-2">OpenAI (Credits Required)</SelectLabel>
                  {getModelsByProvider("openai").map(m => (
                    <SelectItem key={m.id} value={`openai:${m.id}`}>{m.name}</SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-zinc-500 text-xs mt-2">OpenRouter</SelectLabel>
                  {getModelsByProvider("openrouter").map(m => (
                    <SelectItem key={m.id} value={`openrouter:${m.id}`}>{m.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </section>
      ) : (
        <section className="bg-orange-500/10 border border-orange-500/50 p-4 rounded-lg space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-orange-400 text-sm">Confirmation Needed</h3>
              <p className="text-xs text-orange-200/80 mt-1">
                The {primaryTimeframe} chart does not provide enough confirmation. Please switch your chart to <strong>{requestedTimeframe}</strong> and upload a new screenshot.
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full text-xs h-8 border-orange-500/30" onClick={() => clearAnalysis()}>
            Cancel Analysis
          </Button>
        </section>
      )}

      {!analysisResult && (
        <section className="space-y-4">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange}
          />
          
          {!previewImageBase64 ? (
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              className="w-full h-24 border-2 border-dashed border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 flex flex-col gap-2 text-zinc-400"
              variant="outline"
            >
              <Camera className="w-6 h-6" />
              <span>Upload Chart Screenshot {pendingUnsureRequest && `(${requestedTimeframe})`}</span>
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-zinc-800 h-40">
                <img src={previewImageBase64} alt="Chart Preview" className="w-full h-full object-cover" />
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="absolute top-2 right-2 h-7 text-xs bg-black/60 backdrop-blur"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Replace
                </Button>
              </div>
              <Button 
                onClick={handleAnalyze} 
                disabled={isAnalyzing}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-12 text-base shadow-[0_0_20px_rgba(147,51,234,0.3)]"
              >
                {isAnalyzing ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Analyzing...</>
                ) : (
                  <><Activity className="w-5 h-5 mr-2" /> Run AI Analysis</>
                )}
              </Button>
            </div>
          )}
        </section>
      )}

      {analysisResult && (
        <div className="space-y-4">
          <MobileResultCard />
          <div className="flex gap-2">
            <Button 
              className="flex-1 bg-blue-600 hover:bg-blue-700" 
              onClick={() => toast.success("Paper trade started!")}
            >
              Start Paper Trade
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={clearAnalysis}
            >
              Scan Again
            </Button>
          </div>
        </div>
      )}

      <MobileHistory />
    </main>
    </TooltipProvider>
  );
}
