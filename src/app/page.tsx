"use client";

import { useEffect, useRef, useState } from "react";
import { useTradingStore } from "@/store/useTradingStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Play, Square, Activity, Loader2, TrendingUp, TrendingDown, Minus, Clock, FileText, Image as ImageIcon, CheckCircle, Crosshair, Target, ShieldAlert, BarChart3, Settings2, Info, Calculator, Layers, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AI_MODELS, getModelsByProvider } from "@/config/models";
import { toast } from "sonner";
import { TradeTracker } from "@/components/TradeTracker";
import { LogoutButton } from "@/components/LogoutButton";
import { ChatInterface } from "@/components/ChatInterface";
import { SettingsDialog } from "@/components/SettingsDialog";

export default function Dashboard() {
  const { 
    isAnalyzing, setIsAnalyzing, 
    stream, setStream,
    symbol, timeframe,
    trend, signal, confidence, explanation, updateAnalysis,
    entryPrice, stopLoss, takeProfit, recommendedTimeframe,
    capital, setCapital, riskPercent, setRiskPercent,
    selectedProvider, selectedModel, setSelectedModel, apiFailCount, incrementFailCount, resetFailCount,
    setLastImageBase64, tradeHistory,
    isFetchingAnalysis, setIsFetchingAnalysis,
    isAutoScan, setIsAutoScan,
    marketDataMode, setMarketDataMode,
    observations, clearObservations
  } = useTradingStore();

  const [filterSignal, setFilterSignal] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const res = await fetch("/api/trades");
        if (res.ok) {
          const data = await res.json();
          if (data.trades && data.trades.length > 0) {
            useTradingStore.setState({ tradeHistory: data.trades });
          }
        }
      } catch (err) {
        console.error("Failed to load trades", err);
      }
    };
    fetchTrades();
  }, []);

  const handleDeleteTrades = async (ids?: string[]) => {
    if (!confirm(ids ? "Delete selected trades?" : "Delete ALL trades?")) return;
    try {
      setIsDeleting(true);
      const payload = ids ? { ids } : { all: true };
      const res = await fetch("/api/trades", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        if (ids) {
          useTradingStore.setState(state => ({
            tradeHistory: state.tradeHistory.filter(t => !ids.includes(t.dbTradeId!))
          }));
          setSelectedTrades([]);
        } else {
          useTradingStore.setState({ tradeHistory: [] });
          setSelectedTrades([]);
        }
        toast.success("Trades deleted successfully");
      } else {
        toast.error("Failed to delete trades");
      }
    } catch (err) {
      toast.error("Error deleting trades");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (apiFailCount >= 3 && apiFailCount % 3 === 0) {
      toast.error("API is failing repeatedly. Please switch your AI Provider from the top right settings.", {
        duration: 5000,
      });
    }
  }, [apiFailCount]);

  const riskAmount = (capital * riskPercent) / 100;
  let positionSize = 0;
  let potentialProfit = 0;
  
  if (entryPrice && stopLoss && takeProfit) {
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    if (riskPerShare > 0) {
      positionSize = riskAmount / riskPerShare;
      const profitPerShare = Math.abs(takeProfit - entryPrice);
      potentialProfit = positionSize * profitPerShare;
    }
  }

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Auto-Scan Logic
  useEffect(() => {
    if (!isAutoScan || !isAnalyzing || !stream) return;

    let intervalMs = 300000; // Default 5 minutes
    if (timeframe.endsWith("m")) {
      intervalMs = parseInt(timeframe) * 60 * 1000;
    } else if (timeframe.endsWith("h")) {
      intervalMs = parseInt(timeframe) * 60 * 60 * 1000;
    } else if (timeframe.endsWith("s")) {
      intervalMs = parseInt(timeframe) * 1000;
    }

    const timer = setInterval(() => {
      // Avoid overlapping calls if an analysis is still running
      if (!useTradingStore.getState().isFetchingAnalysis) {
        handleAnalyzeSnapshot();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isAutoScan, isAnalyzing, stream, timeframe]);

  // Background Screen Capture for Live Observation (every 30s)
  useEffect(() => {
    if (!stream || marketDataMode !== "visual_only") return;
    
    const captureObservation = () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.7);
      useTradingStore.getState().addObservation(imageBase64);
    };

    const initialTimer = setTimeout(captureObservation, 2000); // 2s after start
    const intervalTimer = setInterval(captureObservation, 30000); // Every 30s

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [stream, marketDataMode]);

  const handleAnalyzeSnapshot = async () => {
    if (!videoRef.current || !canvasRef.current || !stream) return;
    
    if (useTradingStore.getState().isFetchingAnalysis) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.videoWidth === 0) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.7);
    setLastImageBase64(imageBase64);
    
    setIsFetchingAnalysis(true);
    try {      const reqBody: any = { 
        symbol, 
        timeframe, 
        provider: selectedProvider, 
        model: selectedModel, 
        selectedStrategies: useTradingStore.getState().selectedStrategies,
        marketDataMode: useTradingStore.getState().marketDataMode,
        tradingMode: useTradingStore.getState().tradingMode,
        visibleIndicators: useTradingStore.getState().visibleIndicators
      };

      if (useTradingStore.getState().marketDataMode === "visual_only") {
        reqBody.platform = useTradingStore.getState().platform;
        reqBody.tradeDuration = useTradingStore.getState().tradeDuration;
        
        // Grab immediate fresh snapshot for "now"
        const currentImageBase64 = canvas.toDataURL("image/jpeg", 0.8);
        useTradingStore.getState().addObservation(currentImageBase64);
        
        const obs = useTradingStore.getState().observations;
        if (obs.length > 0) {
          reqBody.screenshots = obs.map(o => ({
            timestamp: new Date(o.timestamp).toISOString(),
            mimeType: "image/jpeg",
            base64: o.imageBase64
          }));
        } else {
          reqBody.imageBase64 = currentImageBase64;
        }
      } else {
        const imageBase64 = canvas.toDataURL("image/jpeg", 0.8);
        reqBody.imageBase64 = imageBase64;
      }
      
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });
      
      if (res.ok) {
        resetFailCount();
        const data = await res.json();

        if (data.marketDataStatus === "fallback") {
          toast("Live data not found for this symbol. Falling back to Visual-Only mode.", {
            icon: "👀",
          });
        }

        updateAnalysis({
          trend: data.trend,
          signal: data.signal,
          confidence: data.confidence,
          explanation: data.explanation,
          entryPrice: data.entryPrice,
          takeProfit: data.takeProfit,
          stopLoss: data.stopLoss,
          recommendedTimeframe: data.recommendedTimeframe,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close
        });
        clearObservations(); // RESET CACHE FOR NEXT TRADE
        toast.success("Analysis complete!");
      } else {
        incrementFailCount();
      }
    } catch (err) {
      incrementFailCount();
      console.error("Analysis error:", err);
      toast.error("API Error: Failed to analyze the chart. Please try again.");
    } finally {
      setIsFetchingAnalysis(false);
    }
  };

  const handleStartCapture = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false
      });
      setStream(mediaStream);
      setIsAnalyzing(true);
      
      mediaStream.getVideoTracks()[0].onended = () => {
        setStream(null);
        setIsAnalyzing(false);
      };
    } catch (err) {
      console.error("Error capturing screen:", err);
    }
  };

  const handleStopCapture = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsAnalyzing(false);
  };

  return (
    <main className="container mx-auto p-4 md:p-6 lg:p-8 max-w-7xl">
      <TradeTracker />
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-1 flex items-center gap-4">
            AI Trading Assistant
            <LogoutButton />
          </h1>
          <p className="text-sm md:text-base text-zinc-400">Live AI chart analysis and probability-based signals</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          <TooltipProvider>
            <div className="flex items-center gap-4 flex-wrap w-full md:w-auto">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">AI Model</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-600 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <p>Select which AI provider and model will analyze your chart.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={`${selectedProvider}:${selectedModel}`}
                  onValueChange={(val) => {
                    if (!val) return;
                    const [provider, model] = val.split(":");
                    setSelectedModel(provider, model);
                  }}
                >
                  <SelectTrigger className="w-[240px] bg-zinc-900 border-zinc-800 text-zinc-200 focus:ring-0 focus:ring-offset-0">
                    <Settings2 className="w-4 h-4 mr-2 text-zinc-400" />
                    <SelectValue placeholder="Select AI Model" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[300px]">
                    <SelectGroup>
                      <SelectLabel className="text-zinc-500">Google (Free Tier)</SelectLabel>
                      {getModelsByProvider("gemini").map(m => (
                        <SelectItem key={m.id} value={`gemini:${m.id}`}>{m.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-zinc-500 mt-2">Groq (Free Tier)</SelectLabel>
                      {getModelsByProvider("groq").map(m => (
                        <SelectItem key={m.id} value={`groq:${m.id}`}>{m.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-zinc-500 mt-2">OpenAI (Credits Required)</SelectLabel>
                      {getModelsByProvider("openai").map(m => (
                        <SelectItem key={m.id} value={`openai:${m.id}`}>{m.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-zinc-500 mt-2">OpenRouter</SelectLabel>
                      {getModelsByProvider("openrouter").map(m => (
                        <SelectItem key={m.id} value={`openrouter:${m.id}`}>{m.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {marketDataMode === "api" && (
                <div className="flex flex-col justify-end">
                  <SettingsDialog />
                </div>
              )}

              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Strategy</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-600 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <p>Defines the specific trading rules and timeframes the AI follows.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={useTradingStore.getState().selectedStrategies.join(",")}
                  onValueChange={(val: string | null) => { 
                    if (!val) return;
                    const current = useTradingStore.getState().selectedStrategies;
                    if (current.includes(val)) {
                      useTradingStore.getState().setSelectedStrategies(current.filter(s => s !== val));
                    } else {
                      useTradingStore.getState().setSelectedStrategies([...current, val]);
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800 text-zinc-200 focus:ring-0 focus:ring-offset-0">
                    <Target className="w-4 h-4 mr-2 text-zinc-400" />
                    <SelectValue placeholder="Strategy" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {["Scalping", "Trend Following", "Breakout", "Mean Reversion", "SMC", "ICT", "Swing Trading", "Custom"].map(strat => (
                      <SelectItem key={strat} value={strat}>
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={useTradingStore.getState().selectedStrategies.includes(strat)}
                            readOnly
                            className="w-3 h-3 bg-zinc-800 border-zinc-700 rounded-sm"
                          />
                          {strat}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Data Mode</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-600 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <p>API connects to CCXT (Binance). Visual Only skips CCXT for OTC/Indian Markets.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={marketDataMode}
                  onValueChange={(val: any) => setMarketDataMode(val)}
                >
                  <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-200 focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Market Data" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="api">API Data</SelectItem>
                    <SelectItem value="visual_only">Visual Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Execution</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-600 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <p>Live trading (auto-execution), Paper trading (demo money), or Manual (just signals).</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={useTradingStore.getState().tradingMode}
                  onValueChange={(val: any) => useTradingStore.getState().setTradingMode(val)}
                >
                  <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-200 focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Trading Mode" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="MANUAL">MANUAL</SelectItem>
                    <SelectItem value="PAPER">PAPER TRADING</SelectItem>
                    <SelectItem value="LIVE">LIVE EXECUTON</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {marketDataMode === "visual_only" && (
                <div className="flex flex-col space-y-1 relative">
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Visible Indicators</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-zinc-600 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                        <p>Tell the AI what indicators are visible on your chart.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={useTradingStore.getState().visibleIndicators.join(",")}
                    onValueChange={(val: string | null) => {
                      if (!val) return;
                      const current = useTradingStore.getState().visibleIndicators;
                      if (current.includes(val)) {
                        useTradingStore.getState().setVisibleIndicators(current.filter(i => i !== val));
                      } else {
                        useTradingStore.getState().setVisibleIndicators([...current, val]);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[160px] bg-zinc-900 border-zinc-800 text-zinc-200 focus:ring-0 focus:ring-offset-0">
                      <Layers className="w-4 h-4 mr-2 text-zinc-400" />
                      <SelectValue placeholder="Add Indicator" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      {["RSI", "MACD", "Bollinger Bands", "EMA 20", "EMA 50", "EMA 200", "Volume", "Stochastic", "VWAP", "ATR"].map(ind => (
                        <SelectItem key={ind} value={ind}>
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={useTradingStore.getState().visibleIndicators.includes(ind)}
                              readOnly
                              className="w-3 h-3 bg-zinc-800 border-zinc-700 rounded-sm"
                            />
                            {ind}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </TooltipProvider>
          <Badge variant={isAnalyzing ? "default" : "secondary"} className={isAnalyzing ? "bg-green-500/20 text-green-400 border-green-500/50" : ""}>
            {isAnalyzing ? "● AI Active" : "○ AI Idle"}
          </Badge>
          
          {stream && marketDataMode === "visual_only" && (
            <div className="flex flex-col text-[10px] text-zinc-400 ml-4 border-l border-zinc-800 pl-4 h-full justify-center">
              <div className="flex items-center gap-1.5 font-semibold text-green-400 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                LIVE CHART CONNECTED
              </div>
              <div>Observed Frames: <span className="text-zinc-200">{observations.length}</span> / 5</div>
              {observations.length > 0 && (
                <div>Latest: <span className="text-zinc-200">{new Date(observations[observations.length-1].timestamp).toLocaleTimeString()}</span></div>
              )}
            </div>
          )}
          {!isAnalyzing ? (
            <Button onClick={handleStartCapture} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Play className="w-4 h-4 mr-2" /> Connect Chart
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 mr-2 bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800">
                <Switch checked={isAutoScan} onCheckedChange={setIsAutoScan} id="auto-scan" />
                <Label htmlFor="auto-scan" className="text-zinc-300 text-sm font-medium cursor-pointer">Auto-Scan</Label>
              </div>
              <Button onClick={handleAnalyzeSnapshot} disabled={isFetchingAnalysis} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[160px]">
                {isFetchingAnalysis ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                ) : (
                  <><Activity className="w-4 h-4 mr-2" /> Run AI Analysis</>
                )}
              </Button>
              <Button onClick={() => useTradingStore.getState().clearAnalysis()} variant="secondary" className="text-zinc-300">
                Clear
              </Button>
              <Button onClick={handleStopCapture} variant="destructive">
                <Square className="w-4 h-4 mr-2" /> Disconnect
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Screen Capture & Chat */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-none overflow-hidden h-[500px] flex flex-col relative">
              {marketDataMode === "api" && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-zinc-400 z-10 backdrop-blur-sm">
                  <Activity className="w-16 h-16 mb-4 opacity-50" />
                  <p className="font-medium text-lg text-white">API Data Mode Active</p>
                  <p className="text-sm mt-2 text-center max-w-sm">
                    Visual chart capture is disabled. Analysis is running entirely on live programmatic data from your Exchange Connection.
                  </p>
                </div>
              )}
              {!stream && marketDataMode === "visual_only" ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                  <Activity className="w-16 h-16 mb-4 opacity-50" />
                  <p>No trading chart connected.</p>
                  <p className="text-sm">Click "Connect Chart" to select a browser tab.</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
              {isAnalyzing && marketDataMode === "visual_only" && (
                <div className="absolute top-4 right-4 flex gap-2 z-20 bg-black/60 p-2 rounded-lg backdrop-blur-sm border border-white/10">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-zinc-400 px-1">Platform</Label>
                    <Input
                      style={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                      className="w-24 h-8 text-xs font-medium text-center focus-visible:ring-1 focus-visible:ring-white/20 rounded-md transition-colors"
                      value={useTradingStore.getState().platform}
                      onChange={(e) => useTradingStore.getState().setPlatform(e.target.value)}
                      placeholder="e.g. Binomo"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-zinc-400 px-1">Symbol</Label>
                    <Input
                      style={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                      className="w-28 h-8 text-xs font-medium text-center focus-visible:ring-1 focus-visible:ring-white/20 rounded-md transition-colors"
                      value={symbol}
                      onChange={(e) => useTradingStore.getState().setSymbol(e.target.value.toUpperCase())}
                      placeholder="e.g. EUR/USD"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-zinc-400 px-1">Chart TF</Label>
                    <Input
                      style={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                      className="w-20 h-8 text-xs font-medium text-center focus-visible:ring-1 focus-visible:ring-white/20 rounded-md transition-colors"
                      value={timeframe}
                      onChange={(e) => useTradingStore.getState().setTimeframe(e.target.value)}
                      placeholder="e.g. 5m"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-zinc-400 px-1">Duration</Label>
                    <Input
                      style={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                      className="w-20 h-8 text-xs font-medium text-center focus-visible:ring-1 focus-visible:ring-white/20 rounded-md transition-colors"
                      value={useTradingStore.getState().tradeDuration}
                      onChange={(e) => useTradingStore.getState().setTradeDuration(e.target.value)}
                      placeholder="e.g. 5m"
                    />
                  </div>
                </div>
              )}
            </Card>
          
          <ChatInterface />
        </div>

        {/* Right Column: AI Signals & Settings */}
        <div className="space-y-6">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle>AI Recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">Current Trend</span>
                  {trend === 'Bullish' ? <TrendingUp className="text-green-400 w-5 h-5" /> :
                   trend === 'Bearish' ? <TrendingDown className="text-red-400 w-5 h-5" /> : 
                   <Minus className="text-zinc-400 w-5 h-5" />}
                </div>
                <div className="text-xl font-bold">{trend || "Waiting..."}</div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400">Confidence</span>
                  <span className="font-mono">{confidence}%</span>
                </div>
                <Progress value={confidence} className="h-2 bg-zinc-800" />
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/80 border border-zinc-800">
                 <div className="text-sm text-zinc-400 mb-1">Signal</div>
                 <div className={`text-3xl font-black tracking-widest ${
                   signal === 'BUY' ? 'text-green-500' :
                   signal === 'SELL' ? 'text-red-500' : 
                   signal === 'UNSURE' ? 'text-orange-500' : 'text-yellow-500'
                 }`}>
                   {signal || "WAIT"}
                 </div>
                 
                 {(signal === 'BUY' || signal === 'SELL') && (
                   <div className="mt-4 grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4">
                     <div>
                       <div className="text-xs text-zinc-500">Timeframe</div>
                       <div className="font-mono text-zinc-200">{recommendedTimeframe || timeframe}</div>
                     </div>
                     <div>
                       <div className="text-xs text-zinc-500">Entry</div>
                       <div className="font-mono text-zinc-200">{entryPrice || "-"}</div>
                     </div>
                     <div>
                       <div className="text-xs text-zinc-500">Target (TP)</div>
                       <div className="font-mono text-green-400">{takeProfit || "-"}</div>
                     </div>
                     <div>
                       <div className="text-xs text-zinc-500">Stop Loss (SL)</div>
                       <div className="font-mono text-red-400">{stopLoss || "-"}</div>
                     </div>
                   </div>
                 )}
              </div>
              
              <div>
                <span className="text-sm text-zinc-400 block mb-2">Reasoning</span>
                {useTradingStore.getState().requestedIndicators && useTradingStore.getState().requestedIndicators!.length > 0 && (
                  <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-md text-orange-400 text-sm">
                    <strong>AI Request:</strong> I need you to add the following indicators to your chart for confirmation before I can give a valid signal: <br/>
                    {useTradingStore.getState().requestedIndicators!.join(", ")}
                  </div>
                )}
                <p className="text-sm text-zinc-300 bg-black/40 p-3 rounded-md border border-white/5">
                  {explanation || "Awaiting chart data to analyze market structure and indicators..."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-purple-400" /> Risk Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Capital ($)</Label>
                  <Input 
                    type="number" 
                    value={capital} 
                    onChange={(e) => setCapital(Number(e.target.value))}
                    className="bg-zinc-900/50 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Risk Per Trade (%)</Label>
                  <Input 
                    type="number" 
                    value={riskPercent} 
                    onChange={(e) => setRiskPercent(Number(e.target.value))}
                    className="bg-zinc-900/50 border-zinc-800"
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t border-zinc-800 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Amount at Risk</span>
                  <span className="font-mono text-red-400">${riskAmount.toFixed(2)}</span>
                </div>
                
                {positionSize > 0 ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Position Size (Units)</span>
                      <span className="font-mono text-blue-400">{positionSize.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Potential Profit</span>
                      <span className="font-mono text-green-400">${potentialProfit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Risk/Reward Ratio</span>
                      <span className="font-mono text-yellow-400">
                        1 : {(potentialProfit / riskAmount).toFixed(2)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500 text-center py-2">
                    Waiting for AI Trade Signal to calculate position...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {tradeHistory.length > 0 && (
        <div className="mt-8">
          <Card className="glass-card border-none">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Previous Trades</CardTitle>
                <CardDescription>History of AI recommendations and market data</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={filterSignal} onValueChange={(val) => setFilterSignal(val || "ALL")}>
                  <SelectTrigger className="w-[120px] bg-zinc-900 border-zinc-800 text-zinc-200 h-9">
                    <SelectValue placeholder="Signal" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="ALL">All Signals</SelectItem>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                    <SelectItem value="WAIT">WAIT</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || "ALL")}>
                  <SelectTrigger className="w-[120px] bg-zinc-900 border-zinc-800 text-zinc-200 h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="OPEN">OPEN</SelectItem>
                    <SelectItem value="WON">WON</SelectItem>
                    <SelectItem value="LOST">LOST</SelectItem>
                    <SelectItem value="SKIPPED">SKIPPED</SelectItem>
                  </SelectContent>
                </Select>
                {selectedTrades.length > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-9"
                    onClick={() => handleDeleteTrades(selectedTrades)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedTrades.length})
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                  onClick={() => handleDeleteTrades()}
                  disabled={isDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Clear All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-zinc-300">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50">
                    <tr>
                      <th className="px-4 py-3 w-[40px]">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 bg-zinc-800 border-zinc-700 rounded cursor-pointer"
                          checked={tradeHistory.length > 0 && selectedTrades.length === tradeHistory.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTrades(tradeHistory.map(t => t.dbTradeId!).filter(Boolean));
                            } else {
                              setSelectedTrades([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Pair</th>
                      <th className="px-4 py-3">Signal</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">OHLC</th>
                      <th className="px-4 py-3">Entry/SL/TP</th>
                      <th className="px-4 py-3">Max Move (Fav/Adv)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeHistory.filter((t: any) => {
                      if (filterSignal !== "ALL" && t.signal !== filterSignal) return false;
                      if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
                      return true;
                    }).map((trade: any) => (
                      <tr key={trade.id} className="border-b border-zinc-800 hover:bg-zinc-900/30">
                        <td className="px-4 py-3">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 bg-zinc-800 border-zinc-700 rounded cursor-pointer"
                            checked={trade.dbTradeId ? selectedTrades.includes(trade.dbTradeId) : false}
                            onChange={(e) => {
                              if (!trade.dbTradeId) return;
                              if (e.target.checked) {
                                setSelectedTrades(prev => [...prev, trade.dbTradeId]);
                              } else {
                                setSelectedTrades(prev => prev.filter(id => id !== trade.dbTradeId));
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                        <td className="px-4 py-3 font-medium text-white">{trade.symbol || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            trade.signal === 'BUY' ? 'bg-green-500/20 text-green-400' :
                            trade.signal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {trade.signal}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            trade.status === 'WON' ? 'text-green-400' :
                            trade.status === 'LOST' ? 'text-red-400' : 'text-blue-400'
                          }`}>
                            {trade.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {trade.open ? (
                            <div className="flex gap-2">
                              <span className="text-zinc-500">O:</span>{trade.open?.toFixed(2)} 
                              <span className="text-zinc-500">C:</span>{trade.close?.toFixed(2)}
                            </div>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {trade.entryPrice ? (
                            <div className="flex gap-2">
                              <span className="text-zinc-500">E:</span>{trade.entryPrice} 
                              <span className="text-red-400/80">S:</span>{trade.stopLoss} 
                              <span className="text-green-400/80">T:</span>{trade.takeProfit}
                            </div>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                           <div className="flex gap-2">
                              <span className="text-green-400/80">+{trade.maxFavorableMove?.toFixed(2) || "0.00"}</span>
                              <span className="text-red-400/80">-{trade.maxAdverseMove?.toFixed(2) || "0.00"}</span>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
