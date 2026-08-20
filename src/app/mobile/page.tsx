"use client";

import { useRef } from "react";
import { useMobileStore } from "@/store/useMobileStore";
import { selectMobileAnalysisFrames } from "@/lib/mobile/visualHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  Activity,
  Camera,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Info,
  Layers,
  Target,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { MobileResultCard } from "@/components/mobile/MobileResultCard";
import { MobileHistory } from "@/components/mobile/MobileHistory";
import { getModelsByProvider } from "@/config/models";
import { LogoutButton } from "@/components/LogoutButton";
import { MobileMultiSelect } from "@/components/mobile/MobileMultiSelect";

const STRATEGY_OPTIONS = [
  "Auto (AI Selection)",
  "Scalping",
  "Trend Following",
  "Breakout",
  "Mean Reversion",
  "SMC",
  "ICT",
  "Swing Trading",
];

const INDICATOR_OPTIONS = [
  "RSI",
  "MACD",
  "Bollinger Bands",
  "EMA 20",
  "EMA 50",
  "EMA 200",
  "Volume",
  "Stochastic",
  "VWAP",
  "ATR",
];

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

  const toggleStrategy = (value: string) => {
    setField(
      "selectedStrategies",
      selectedStrategies.includes(value)
        ? selectedStrategies.filter((item) => item !== value)
        : [...selectedStrategies, value],
    );
  };

  const toggleIndicator = (value: string) => {
    setField(
      "visibleIndicators",
      visibleIndicators.includes(value)
        ? visibleIndicators.filter((item) => item !== value)
        : [...visibleIndicators, value],
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 1920;

        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setField("previewImageBase64", canvas.toDataURL("image/jpeg", 0.7));
        }
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
      const state = useMobileStore.getState();
      let payload: any = {
        imageBase64: previewImageBase64,
        platform: platform?.trim() || "OlympTrade",
        symbol: symbol?.trim().toUpperCase(),
        timeframe:
          (pendingUnsureRequest && requestedTimeframe
            ? requestedTimeframe
            : primaryTimeframe
          )?.trim() || "5m",
        tradeDuration: tradeDuration?.trim(),
        confirmationTimeframe: confirmationTimeframe?.trim(),
        provider: selectedProvider,
        model: selectedModel,
        useDualModel: state.useDualModel,
        reasoningProvider: state.selectedReasoningProvider,
        reasoningModel: state.selectedReasoningModel,
        selectedStrategies,
        visibleIndicators,
        marketDataMode: "visual_only",
        previousData: pendingUnsureRequest ? previousAnalysisData : undefined,
      };

      if (state.useDualModel) {
        toast.loading("Step 1: Progressive Vision Extraction...");
        const progRes = await fetch("/api/progressive-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, isProgressive: true }),
        });
        toast.dismiss();

        if (progRes.ok) {
          const progData = await progRes.json();
          // Attach the extracted JSON to the final payload
          payload.progressiveState = [progData];
          payload.isProgressive = false;
        } else {
          throw new Error("Progressive Vision Extraction failed");
        }
      }

      if (state.useDualModel) {
        toast.loading("Step 2: Text Reasoning...");
        payload.model = payload.reasoningModel;
        payload.provider = payload.reasoningProvider;
        delete payload.screenshots;
        delete payload.macroTimeframeImage;
        delete payload.confirmationTimeframeImage;
        delete payload.structureTimeframeImage;
      } else {
        toast.loading("Analyzing...");
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.dismiss();

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
                  <Label className="text-xs text-zinc-400">Platform</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Trading platform being used (e.g. OlympTrade)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  value={platform}
                  onChange={(e) => setField("platform", e.target.value)}
                  className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                  placeholder="e.g. Binomo"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-zinc-400">Symbol</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Asset ticker pair (e.g. BTCUSDT)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  value={symbol}
                  onChange={(e) => setField("symbol", e.target.value.toUpperCase())}
                  className="h-9 bg-zinc-900 border-zinc-800 text-sm font-medium text-center"
                  placeholder="e.g. EUR/USD"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-zinc-400">Chart TF</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Primary chart timeframe (e.g. 5m)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  value={primaryTimeframe}
                  onChange={(e) => setField("primaryTimeframe", e.target.value)}
                  className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                  placeholder="e.g. 5m"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-zinc-400">Duration</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>How long the trade should last</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  value={tradeDuration}
                  onChange={(e) => setField("tradeDuration", e.target.value)}
                  className="h-9 bg-zinc-900 border-zinc-800 text-sm text-center"
                  placeholder="e.g. 5m"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-zinc-400">
                  {useMobileStore.getState().useDualModel ? "Progressive Analysis Model (Vision)" : "AI Model"}
                </Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-zinc-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{useMobileStore.getState().useDualModel ? "This model is used ONLY by: /api/progressive-analyze" : "Select the AI provider and model for analysis."}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select
                  value={`${selectedProvider}:${selectedModel}`}
                  onValueChange={(val) => {
                    if (!val) return;
                    const idx = val.indexOf(":");
                    const provider = val.substring(0, idx) as any;
                    const model = val.substring(idx + 1);
                    setField("selectedProvider", provider);
                    setField("selectedModel", model);
                  }}
              >
                <SelectTrigger className="h-9 w-full bg-zinc-900 border-zinc-800 text-sm">
                  <SelectValue placeholder="AI Model" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectGroup>
                    <SelectLabel className="text-zinc-500 text-xs">Google (Free Tier)</SelectLabel>
                    {getModelsByProvider("gemini").map((model) => (
                      <SelectItem key={model.id} value={`gemini:${model.id}`}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-zinc-500 text-xs mt-2">Groq (Free Tier)</SelectLabel>
                    {getModelsByProvider("groq").map((model) => (
                      <SelectItem key={model.id} value={`groq:${model.id}`}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-zinc-500 text-xs mt-2">OpenAI (Credits Required)</SelectLabel>
                    {getModelsByProvider("openai").map((model) => (
                      <SelectItem key={model.id} value={`openai:${model.id}`}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-zinc-500 text-xs mt-2">OpenRouter</SelectLabel>
                    {getModelsByProvider("openrouter").map((model) => (
                      <SelectItem key={model.id} value={`openrouter:${model.id}`}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-zinc-400">Use Dual Model</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-zinc-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Enable Dual Model mode to save tokens. Vision model extracts data, Text model analyzes it.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch
                checked={useMobileStore.getState().useDualModel}
                onCheckedChange={(val) => setField("useDualModel", val)}
                className="data-[state=checked]:bg-amber-500"
              />
            </div>
            
            {useMobileStore.getState().useDualModel && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-amber-500">Final Analysis Model (Text)</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This model is used ONLY by: /api/analyze</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={`${useMobileStore.getState().selectedReasoningProvider}:${useMobileStore.getState().selectedReasoningModel}`}
                  onValueChange={(val) => {
                    if (!val) return;
                    const idx = val.indexOf(":");
                    const provider = val.substring(0, idx) as any;
                    const model = val.substring(idx + 1);
                    setField("selectedReasoningProvider", provider);
                    setField("selectedReasoningModel", model);
                  }}
                >
                  <SelectTrigger className="h-9 w-full bg-zinc-900 border-zinc-800 text-sm">
                    <SelectValue placeholder="Reasoning Model" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectGroup>
                      <SelectLabel className="text-zinc-500 text-xs">OpenRouter (Text Only)</SelectLabel>
                      {getModelsByProvider("openrouter").map((model) => (
                        <SelectItem key={model.id} value={`openrouter:${model.id}`}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-zinc-400">Selected Strategies</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-zinc-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select one or more trading strategies for the AI to apply.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <MobileMultiSelect
                selected={selectedStrategies}
                options={STRATEGY_OPTIONS}
                onChange={toggleStrategy}
                placeholder="Add Strategy"
                icon={<Target className="w-4 h-4 mr-2 text-zinc-400" />}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-zinc-400">Visible Indicators</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-zinc-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Tell the AI what indicators are visible on your chart.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <MobileMultiSelect
                selected={visibleIndicators}
                options={INDICATOR_OPTIONS}
                onChange={toggleIndicator}
                placeholder="Add Indicator"
                icon={<Layers className="w-4 h-4 mr-2 text-zinc-400" />}
              />
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
            <Button
              variant="outline"
              className="w-full text-xs h-8 border-orange-500/30"
              onClick={clearAnalysis}
            >
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
                  <img
                    src={previewImageBase64}
                    alt="Chart Preview"
                    className="w-full h-full object-cover"
                  />
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

