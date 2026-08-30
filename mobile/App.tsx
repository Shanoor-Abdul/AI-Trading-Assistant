import React, { useState, useRef } from "react";
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform, Modal, ToastAndroid } from "react-native";
import { WebView } from "react-native-webview";
import { captureRef } from "react-native-view-shot";
import { launchImageLibrary } from 'react-native-image-picker';
import { useMobileTradingStore } from "./src/store/useMobileTradingStore";
import { AI_MODELS, AVAILABLE_STRATEGIES, AVAILABLE_INDICATORS } from "./src/lib/types";
import { PLATFORMS, getPlatformOptions } from "./src/store/TradingPlatform";

const INJECTED_JS = `
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, contextAttributes) {
    if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
      contextAttributes = contextAttributes || {};
      contextAttributes.preserveDrawingBuffer = true;
    }
    return originalGetContext.call(this, type, contextAttributes);
  };
  true;
`;

export default function App() {
  const store = useMobileTradingStore();
  const [mode, setMode] = useState<"trade" | "settings">("trade");
  const [platformModalVisible, setPlatformModalVisible] = useState(false);
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [strategiesModalVisible, setStrategiesModalVisible] = useState(false);
  const [indicatorsModalVisible, setIndicatorsModalVisible] = useState(false);
  const [analysisModalVisible, setAnalysisModalVisible] = useState(false);

  const AI_MODELS = [
      { id: "claude-sonnet-5", name: "Claude Sonnet 5 (Native)", provider: "anthropic", isFree: false },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "anthropic", isFree: false },

    
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", isFree: true },
    { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", provider: "gemini", isFree: true },
    { id: "llama-3.2-90b-vision-preview", name: "Llama 3.2 90B Vision", provider: "groq", isFree: true },
    { id: "qwen/qwen-2-vl-7b-instruct:free", name: "Qwen 2 VL 7B (Best Free)", provider: "openrouter", isFree: true },
    { id: "google/gemini-2.0-flash-lite-preview-02-05:free", name: "Gemini Flash Lite (OpenRouter)", provider: "openrouter", isFree: true },
    { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (OpenRouter)", provider: "openrouter", isFree: true },
    { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B (OpenRouter)", provider: "openrouter", isFree: true },
    { id: "nvidia/nemotron-nano-12b-v2-vl:free", name: "Nemotron Nano 12B VL", provider: "openrouter", isFree: true },
    { id: "openrouter/free", name: "OpenRouter Free Router", provider: "openrouter", isFree: true },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", isFree: false },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai", isFree: false },
    { id: "gpt-4.5-preview", name: "GPT-4.5 Preview", provider: "openai", isFree: false },
    { id: "o1-mini", name: "o1 Mini", provider: "openai", isFree: false },
    { id: "o1-preview", name: "o1 Preview", provider: "openai", isFree: false },
  ];
  const AVAILABLE_STRATEGIES = ["Scalping", "Trend Following", "Breakout", "Mean Reversion", "SMC", "ICT", "Swing Trading", "Custom"];
  const AVAILABLE_INDICATORS = ["RSI", "MACD", "Bollinger Bands", "EMA 20", "EMA 50", "EMA 200", "Volume", "Stochastic", "VWAP", "ATR"];

  // WebView Ref for capturing
  const webViewContainerRef = useRef<View>(null);

  const takeSnapshot = async (): Promise<string | null> => {
    try {
      if (webViewContainerRef.current) {
        return await captureRef(webViewContainerRef, {
          format: "jpg",
          quality: 0.8,
          result: "base64",
          handleGLSurfaceViewOnAndroid: true,
        });
      }
      return null;
    } catch (error) {
      console.error("Snapshot failed", error);
      return null;
    }
  };

  const runAnalysis = async () => {
    // Unconditionally capture a screenshot for manual analysis
    const base64 = await takeSnapshot();
    if (!base64) {
      if (Platform.OS === 'android') {
        ToastAndroid.show("Error: Could not capture the trading platform screen.", ToastAndroid.LONG);
      } else {
        Alert.alert("Error", "Could not capture the trading platform screen.");
      }
      return;
    }
    const currentObs = [{ timestamp: Date.now(), imageBase64: base64 }];

    store.setIsAnalyzing(true);
    try {
      const response = await fetch("https://ai-all-trading-assistant.vercel.app/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: store.symbol.trim().toUpperCase(),
          timeframe: store.timeframe,
          platform: PLATFORMS[store.platformId]?.name || "Custom",
          tradeDuration: store.tradeDuration,
          provider: store.selectedProvider,
          model: store.selectedModel,
          selectedStrategies: store.selectedStrategies,
          visibleIndicators: store.visibleIndicators,
          marketDataMode: "visual_only",
          screenshots: currentObs.map((obs) => ({
            timestamp: new Date(obs.timestamp).toISOString(),
            mimeType: "image/jpeg",
            base64: obs.imageBase64,
          })),
          isProgressive: false,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Analysis failed (${response.status}).`);
      }

      const result = await response.json();
      store.updateAnalysis({
        trend: result.trend,
        signal: result.signal,
        confidence: result.confidence,
        explanation: result.explanation,
        entryPrice: result.entryPrice,
        takeProfit: result.takeProfit,
        stopLoss: result.stopLoss,
      });

      // Append to history
      store.setAnalysisHistory([
        {
          id: Date.now().toString(),
          timestamp: Date.now(),
          symbol: store.symbol,
          signal: result.signal,
          trend: result.trend,
          confidence: result.confidence,
          entryPrice: result.entryPrice,
          takeProfit: result.takeProfit,
          stopLoss: result.stopLoss,
        },
        ...store.analysisHistory,
      ]);

      setAnalysisModalVisible(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unable to analyze.";
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Analysis failed: ${msg}`, ToastAndroid.LONG);
      } else {
        Alert.alert("Analysis failed", msg);
      }
    } finally {
      store.setIsAnalyzing(false);
    }
  };

  const handleManualImageAnalysis = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.8,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        return;
      }

      const base64Image = result.assets[0].base64;
      if (!base64Image) {
        throw new Error("Could not read image data.");
      }

      store.setIsAnalyzing(true);
      
      const response = await fetch("https://ai-all-trading-assistant.vercel.app/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: store.symbol.trim().toUpperCase(),
          timeframe: store.timeframe,
          platform: PLATFORMS[store.platformId]?.name || "Custom",
          tradeDuration: store.tradeDuration,
          provider: store.selectedProvider,
          model: store.selectedModel,
          selectedStrategies: store.selectedStrategies,
          visibleIndicators: store.visibleIndicators,
          marketDataMode: "visual_only",
          screenshots: [{
            timestamp: new Date().toISOString(),
            mimeType: "image/jpeg",
            base64: base64Image,
          }],
          isProgressive: false,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Analysis failed (${response.status}).`);
      }

      const res = await response.json();
      store.updateAnalysis({
        trend: res.trend,
        signal: res.signal,
        confidence: res.confidence,
        explanation: res.explanation,
        entryPrice: res.entryPrice,
        takeProfit: res.takeProfit,
        stopLoss: res.stopLoss,
      });

      // Append to history
      store.setAnalysisHistory([
        {
          id: Date.now().toString(),
          timestamp: Date.now(),
          symbol: store.symbol,
          signal: res.signal,
          trend: res.trend,
          confidence: res.confidence,
          entryPrice: res.entryPrice,
          takeProfit: res.takeProfit,
          stopLoss: res.stopLoss,
        },
        ...store.analysisHistory,
      ]);

      setAnalysisModalVisible(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unable to analyze uploaded image.";
      if (Platform.OS === 'android') {
        ToastAndroid.show(`Upload failed: ${msg}`, ToastAndroid.LONG);
      } else {
        Alert.alert("Upload failed", msg);
      }
    } finally {
      store.setIsAnalyzing(false);
    }
  };



  return (
    <SafeAreaView style={styles.safe}>
      {/* 📈 Trading Platform Tab */}
      <View style={[styles.webContainer, mode !== "trade" && { display: 'none' }]}>
        {/* Platform Selector Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.platformSelector} onPress={() => setPlatformModalVisible(true)}>
            <Text style={styles.platformSelectorText}>
              {PLATFORMS[store.platformId]?.name || "Select Platform"} ▼
            </Text>
          </TouchableOpacity>
        </View>

        {/* WebView Container for Capture */}
        <View ref={webViewContainerRef} collapsable={false} style={styles.webviewContainer}>
          <WebView 
            source={{ uri: store.platformUrl }} 
            style={styles.webview} 
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
          />
        </View>

        {/* Live Observation Overlay */}
        {store.isLiveObservation && store.marketDataMode === "visual_only" && (
          <View style={styles.liveOverlay} pointerEvents="none">
            <Text style={styles.liveTitle}>LIVE OBSERVATION</Text>
            
            <View style={styles.liveRow}>
              <Text style={styles.liveLabel}>Status:</Text>
              <Text style={styles.liveActive}>● ACTIVE</Text>
            </View>
            
            <View style={styles.liveRow}>
              <Text style={styles.liveLabel}>Current Frames:</Text>
              <Text style={styles.liveValue}>{observations.length}</Text>
            </View>
            
            <View style={styles.liveRow}>
              <Text style={styles.liveLabel}>Current Batch:</Text>
              <Text style={styles.liveValue}>{observations.length} / {store.analysisBatchSize}</Text>
            </View>
            
            <View style={styles.liveRow}>
              <Text style={styles.liveLabel}>Completed AI Analyses:</Text>
              <Text style={styles.liveValue}>{store.analysisHistory.length}</Text>
            </View>
            
            <View style={styles.liveRow}>
              <Text style={styles.liveLabel}>Next Frame:</Text>
              <Text style={styles.liveValue}>{timeUntilNextFrame.toFixed(2)}s</Text>
            </View>
            
            <View style={styles.liveRow}>
              <Text style={styles.liveLabel}>Readiness:</Text>
              <Text style={styles.liveValue}>{observations.length >= store.analysisBatchSize ? "READY" : "WAITING"}</Text>
            </View>
          </View>
        )}
        
        <TouchableOpacity 
          disabled={store.isAnalyzing} 
          onPress={runAnalysis} 
          style={[styles.fab, store.isAnalyzing && styles.disabled]}
        >
          <Text style={styles.primaryText}>{store.isAnalyzing ? "Analyzing…" : "🤖 AI Analyze"}</Text>
        </TouchableOpacity>
      </View>

      {/* ⚙️ AI Settings Tab */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[{flex: 1}, mode !== "settings" && { display: 'none' }]}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>AI Trading Settings</Text>
          
          <View style={styles.card}>
            <Text style={styles.label}>Symbol</Text>
            <TextInput 
              value={store.symbol} 
              onChangeText={store.setSymbol} 
              placeholder="BTC/USDT" 
              placeholderTextColor="#71717a" 
              style={styles.input} 
              autoCapitalize="characters"
            />
            
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Chart Timeframe</Text>
                <TextInput 
                  value={store.timeframe} 
                  onChangeText={store.setTimeframe} 
                  style={styles.input} 
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Trade Timeframe</Text>
                <TextInput 
                  value={store.tradeDuration} 
                  onChangeText={store.setTradeDuration} 
                  style={styles.input} 
                />
              </View>
            </View>

            <Text style={styles.label}>AI Model</Text>
            <TouchableOpacity style={styles.dropdownInput} onPress={() => setModelModalVisible(true)}>
              <Text style={styles.dropdownText}>
                {AI_MODELS.find(m => m.id === store.selectedModel)?.name || store.selectedModel}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Strategies</Text>
            <TouchableOpacity style={styles.dropdownInput} onPress={() => setStrategiesModalVisible(true)}>
              <Text style={styles.dropdownText}>{store.selectedStrategies.length > 0 ? store.selectedStrategies.join(", ") : "Select Strategies"}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Indicators</Text>
            <TouchableOpacity style={styles.dropdownInput} onPress={() => setIndicatorsModalVisible(true)}>
              <Text style={styles.dropdownText}>{store.visibleIndicators.length > 0 ? store.visibleIndicators.join(", ") : "Select Indicators"}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Execution Mode</Text>
            <View style={styles.row}>
              {(['MANUAL', 'PAPER', 'LIVE'] as const).map((m) => (
                <TouchableOpacity 
                  key={m} 
                  onPress={() => store.setTradingMode(m)} 
                  style={[styles.choice, store.tradingMode === m && styles.choiceActive]}
                >
                  <Text style={[styles.choiceText, {fontSize: 10}]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

          </View>
          
          {/* 📜 Trade History */}
          <View style={styles.card}>
            <Text style={[styles.label, { marginBottom: 10 }]}>History of Trades</Text>
            {store.analysisHistory.length === 0 ? (
              <Text style={styles.small}>No trade history yet.</Text>
            ) : (
              store.analysisHistory.map((trade, index) => (
                <View key={trade.id || index} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historySymbol}>{trade.symbol}</Text>
                    <Text style={[styles.historySignal, trade.signal === 'BUY' ? styles.signalBuy : trade.signal === 'SELL' ? styles.signalSell : styles.signalWait]}>
                      {trade.signal}
                    </Text>
                  </View>
                  <View style={styles.historyDetails}>
                    <View style={styles.historyStat}>
                      <Text style={styles.historyStatLabel}>Entry</Text>
                      <Text style={styles.historyStatValue}>{trade.entryPrice || '-'}</Text>
                    </View>
                    <View style={styles.historyStat}>
                      <Text style={styles.historyStatLabel}>Target</Text>
                      <Text style={[styles.historyStatValue, {color: '#4ade80'}]}>{trade.takeProfit || '-'}</Text>
                    </View>
                    <View style={styles.historyStat}>
                      <Text style={styles.historyStatLabel}>Stop</Text>
                      <Text style={[styles.historyStatValue, {color: '#f87171'}]}>{trade.stopLoss || '-'}</Text>
                    </View>
                  </View>
                  <Text style={styles.historyTime}>
                    {new Date(trade.timestamp).toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </View>
          
          <View style={styles.card}>
            <Text style={styles.label}>Manual Upload</Text>
            <Text style={styles.small}>
              Manually upload a screenshot from your device to analyze it instantly.
            </Text>
            <TouchableOpacity 
              disabled={store.isAnalyzing}
              onPress={handleManualImageAnalysis} 
              style={[styles.primary, store.isAnalyzing && styles.disabled, { backgroundColor: "#8b5cf6" }]}
            >
              <Text style={styles.primaryText}>{store.isAnalyzing ? "Analyzing..." : "Upload Image & Analyze"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabButton, mode === "trade" && styles.tabButtonActive]} onPress={() => setMode("trade")}>
          <Text style={[styles.tabText, mode === "trade" && styles.tabTextActive]}>📈 Trading Platform</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, mode === "settings" && styles.tabButtonActive]} onPress={() => setMode("settings")}>
          <Text style={[styles.tabText, mode === "settings" && styles.tabTextActive]}>⚙️ AI Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Platform Selector Modal */}
      <Modal visible={platformModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPlatformModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Platform</Text>
            {getPlatformOptions().map((platform) => (
              <TouchableOpacity 
                key={platform.id}
                style={styles.modalOption}
                onPress={() => {
                  store.setPlatformId(platform.id);
                  setPlatformModalVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, store.platformId === platform.id && styles.modalOptionTextActive]}>
                  {platform.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Model Selector Modal */}
      <Modal visible={modelModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModelModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select AI Model</Text>
            {AI_MODELS.map((model) => (
              <TouchableOpacity 
                key={model.id}
                style={styles.modalOption}
                onPress={() => {
                  store.setSelectedModel(model.id);
                  store.setSelectedProvider(model.provider);
                  setModelModalVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, store.selectedModel === model.id && styles.modalOptionTextActive]}>
                  {model.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Strategies Multi-Select Modal */}
      <Modal visible={strategiesModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setStrategiesModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Strategies</Text>
            {AVAILABLE_STRATEGIES.map((strategy) => {
              const isSelected = store.selectedStrategies.includes(strategy);
              return (
                <TouchableOpacity 
                  key={strategy}
                  style={styles.modalOption}
                  onPress={() => {
                    if (isSelected) store.setSelectedStrategies(store.selectedStrategies.filter(s => s !== strategy));
                    else store.setSelectedStrategies([...store.selectedStrategies, strategy]);
                  }}
                >
                  <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]}>
                    {isSelected ? "✅ " : "⬜ "}{strategy}
                  </Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity style={styles.primary} onPress={() => setStrategiesModalVisible(false)}>
              <Text style={styles.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Indicators Multi-Select Modal */}
      <Modal visible={indicatorsModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIndicatorsModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Indicators</Text>
            {AVAILABLE_INDICATORS.map((indicator) => {
              const isSelected = store.visibleIndicators.includes(indicator);
              return (
                <TouchableOpacity 
                  key={indicator}
                  style={styles.modalOption}
                  onPress={() => {
                    if (isSelected) store.setVisibleIndicators(store.visibleIndicators.filter(i => i !== indicator));
                    else store.setVisibleIndicators([...store.visibleIndicators, indicator]);
                  }}
                >
                  <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]}>
                    {isSelected ? "✅ " : "⬜ "}{indicator}
                  </Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity style={styles.primary} onPress={() => setIndicatorsModalVisible(false)}>
              <Text style={styles.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {/* AI Analysis Result Modal */}
      <Modal visible={analysisModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.resultModalContent}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Analysis Complete</Text>
              <Text style={[styles.signalBadge, {
                backgroundColor: store.signal === 'BUY' ? '#16a34a' : 
                                 store.signal === 'SELL' ? '#dc2626' : '#52525b'
              }]}>
                {store.signal}
              </Text>
            </View>
            
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Trend: <Text style={styles.resultValue}>{store.trend}</Text></Text>
              <Text style={styles.label}>Confidence: <Text style={styles.resultValue}>{store.confidence}%</Text></Text>
            </View>

            {(store.entryPrice || store.takeProfit || store.stopLoss) && (
              <View style={styles.levelsCard}>
                {store.entryPrice && <Text style={styles.levelText}>ENTRY: {store.entryPrice}</Text>}
                {store.takeProfit && <Text style={[styles.levelText, {color: '#4ade80'}]}>TARGET: {store.takeProfit}</Text>}
                {store.stopLoss && <Text style={[styles.levelText, {color: '#f87171'}]}>STOP LOSS: {store.stopLoss}</Text>}
              </View>
            )}

            <ScrollView style={styles.explanationScroll}>
              <Text style={styles.explanationText}>{store.explanation}</Text>
            </ScrollView>

            <TouchableOpacity style={styles.primary} onPress={() => setAnalysisModalVisible(false)}>
              <Text style={styles.primaryText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09090b" },
  header: { padding: 12, backgroundColor: "#18181b", borderBottomWidth: 1, borderBottomColor: "#27272a", alignItems: 'center' },
  platformSelector: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "#27272a", borderRadius: 8 },
  platformSelectorText: { color: "#fff", fontWeight: "700" },
  container: { padding: 18, gap: 14, paddingBottom: 80 },
  webContainer: { flex: 1 },
  webviewContainer: { flex: 1 },
  webview: { flex: 1 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800" },
  card: { backgroundColor: "#18181b", borderRadius: 12, padding: 14, gap: 9 },
  label: { color: "#a1a1aa", fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: "#27272a", color: "#fff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  dropdownInput: { backgroundColor: "#27272a", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 12 },
  dropdownText: { color: "#fff" },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1, gap: 6 },
  choice: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: "#27272a", alignItems: "center" },
  choiceActive: { backgroundColor: "#2563eb" },
  choiceText: { color: "#fff", fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between" },
  active: { color: "#4ade80", fontWeight: "800", fontSize: 11 },
  muted: { color: "#71717a", fontWeight: "800", fontSize: 11 },
  small: { color: "#71717a", fontSize: 11, lineHeight: 16 },
  signal: { color: "#fff", fontSize: 22, fontWeight: "900" },
  primary: { backgroundColor: "#2563eb", padding: 13, borderRadius: 9, alignItems: "center", marginTop: 4 },
  primaryText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.45 },
  tabBar: { flexDirection: "row", backgroundColor: "#18181b", borderTopWidth: 1, borderTopColor: "#27272a" },
  tabButton: { flex: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  tabButtonActive: { borderTopWidth: 2, borderTopColor: "#3b82f6", marginTop: -1 },
  tabText: { color: "#a1a1aa", fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: "#3b82f6" },
  fab: { position: "absolute", bottom: 20, right: 20, backgroundColor: "#16a34a", padding: 15, borderRadius: 30, elevation: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#18181b', borderRadius: 12, padding: 20, width: '80%', gap: 10 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  modalOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  modalOptionText: { color: '#a1a1aa', fontSize: 16, textAlign: 'center' },
  modalOptionTextActive: { color: '#3b82f6', fontWeight: 'bold' },
  resultModalContent: { backgroundColor: '#18181b', borderRadius: 16, padding: 20, width: '90%', maxHeight: '80%', gap: 14, borderWidth: 1, borderColor: '#27272a' },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#27272a', paddingBottom: 12 },
  resultTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  signalBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, color: '#fff', fontWeight: '900', fontSize: 16 },
  resultValue: { color: '#fff', fontSize: 14 },
  levelsCard: { backgroundColor: '#27272a', padding: 12, borderRadius: 8, gap: 4 },
  levelText: { color: '#e4e4e7', fontWeight: '700', fontSize: 13 },
  explanationScroll: { backgroundColor: '#09090b', padding: 12, borderRadius: 8, flexGrow: 0, maxHeight: 250 },
  explanationText: { color: '#d4d4d8', fontSize: 13, lineHeight: 20 },
  historyCard: { backgroundColor: '#27272a', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#3f3f46' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historySymbol: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  historySignal: { color: '#fff', fontSize: 13, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  signalBuy: { backgroundColor: '#16a34a' },
  signalSell: { backgroundColor: '#dc2626' },
  signalWait: { backgroundColor: '#52525b' },
  historyDetails: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#18181b', padding: 8, borderRadius: 6, marginBottom: 8 },
  historyStat: { alignItems: 'center' },
  historyStatLabel: { color: '#a1a1aa', fontSize: 10, textTransform: 'uppercase', marginBottom: 2 },
  historyStatValue: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  historyTime: { color: '#71717a', fontSize: 10, textAlign: 'right' },
  liveOverlay: { position: 'absolute', top: 60, left: 10, right: 10, backgroundColor: 'rgba(24, 24, 27, 0.9)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#27272a', gap: 6, elevation: 4 },
  liveTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 4, letterSpacing: 1 },
  liveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveLabel: { color: '#a1a1aa', fontSize: 13, fontWeight: '700' },
  liveValue: { color: '#fff', fontSize: 13, fontWeight: '800' },
  liveActive: { color: '#4ade80', fontSize: 13, fontWeight: '900' }
});
