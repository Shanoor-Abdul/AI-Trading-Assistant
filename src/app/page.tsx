"use client";

import { useEffect, useRef } from "react";
import { useTradingStore } from "@/store/useTradingStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Activity, TrendingUp, TrendingDown, Minus, Calculator, Settings2 } from "lucide-react";
import { AI_MODELS, getModelsByProvider } from "@/config/models";
import { toast } from "sonner";
import { TradeTracker } from "@/components/TradeTracker";
import { LogoutButton } from "@/components/LogoutButton";
import { ChatInterface } from "@/components/ChatInterface";

export default function Dashboard() {
  const { 
    isAnalyzing, setIsAnalyzing, 
    stream, setStream,
    symbol, timeframe,
    trend, signal, confidence, explanation, updateAnalysis,
    entryPrice, stopLoss, takeProfit, recommendedTimeframe,
    capital, setCapital, riskPercent, setRiskPercent,
    selectedProvider, selectedModel, setSelectedModel, apiFailCount, incrementFailCount, resetFailCount,
    setLastImageBase64, tradeHistory
  } = useTradingStore();

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
  
  // Auto-polling removed based on user request. Analysis is now purely manual.

  const handleAnalyzeSnapshot = async () => {
    if (!videoRef.current || !canvasRef.current || !stream) return;
    
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
    
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, symbol, timeframe, provider: selectedProvider, model: selectedModel })
      });
      
      if (res.ok) {
        resetFailCount();
        const data = await res.json();

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
      } else {
        incrementFailCount();
      }
    } catch (err) {
      incrementFailCount();
      console.error("Analysis error:", err);
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
          <div className="flex items-center gap-2">
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
          <Badge variant={isAnalyzing ? "default" : "secondary"} className={isAnalyzing ? "bg-green-500/20 text-green-400 border-green-500/50" : ""}>
            {isAnalyzing ? "● AI Active" : "○ AI Idle"}
          </Badge>
          {!isAnalyzing ? (
            <Button onClick={handleStartCapture} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Play className="w-4 h-4 mr-2" /> Connect Chart
            </Button>
          ) : (
            <>
              <Button onClick={handleAnalyzeSnapshot} className="bg-purple-600 hover:bg-purple-700 text-white">
                <Activity className="w-4 h-4 mr-2" /> Run AI Analysis
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
            {!stream ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                <Activity className="w-16 h-16 mb-4 opacity-50" />
                <p>No trading chart connected.</p>
                <p className="text-sm">Click "Start Analysis" to select a browser tab.</p>
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
            {isAnalyzing && (
              <div className="absolute top-4 right-4 flex gap-2">
                <Input
                  className="bg-black/60 backdrop-blur-md text-white border-none w-32 h-8 text-xs font-medium text-center focus-visible:ring-1 focus-visible:ring-white/20"
                  value={symbol}
                  onChange={(e) => useTradingStore.getState().setSymbol(e.target.value.toUpperCase())}
                  placeholder="Pair (e.g. BTCUSDT)"
                />
                <Input
                  className="bg-black/60 backdrop-blur-md text-white border-none w-20 h-8 text-xs font-medium text-center focus-visible:ring-1 focus-visible:ring-white/20"
                  value={timeframe}
                  onChange={(e) => useTradingStore.getState().setTimeframe(e.target.value)}
                  placeholder="Time (e.g. 5m)"
                />
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
            <CardHeader>
              <CardTitle>Previous Trades</CardTitle>
              <CardDescription>History of AI recommendations and market data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-zinc-300">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50">
                    <tr>
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
                    {tradeHistory.map((trade: any) => (
                      <tr key={trade.id} className="border-b border-zinc-800 hover:bg-zinc-900/30">
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
