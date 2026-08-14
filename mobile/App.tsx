import React, { useEffect, useMemo, useState } from "react";
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { analyzeMobileObservations } from "./src/api";
import { screenCapture } from "./src/screenCapture";
import { MAX_OBSERVATIONS, useMobileStore } from "./src/store";
import type { ScreenFrame } from "./src/screenCapture";

export default function App() {
  const {
    platform, symbol, tradeDuration, primaryTimeframe, selectedStrategies, visibleIndicators,
    selectedProvider, selectedModel, observations, previousAnalysis, currentAnalysis, isAnalyzing,
    setConfig, addObservation, saveAnalysis, setAnalyzing, clearObservations,
  } = useMobileStore();
  const [sharing, setSharing] = useState(false);
  const [frequency, setFrequency] = useState(15);

  useEffect(() => screenCapture.subscribe((frame: ScreenFrame) => {
    addObservation({ timestamp: frame.timestamp, imageBase64: frame.base64 });
  }), [addObservation]);

  const readiness = useMemo(() => Math.min(100, Math.round((observations.length / MAX_OBSERVATIONS) * 100)), [observations.length]);

  const startCapture = async () => {
    if (!screenCapture.isAvailable) {
      Alert.alert("Android screen capture unavailable", "Build and run the native Android app. Browser/Vercel deployments cannot access Android MediaProjection.");
      return;
    }
    try {
      await screenCapture.start(frequency);
      setSharing(true);
    } catch (error) {
      Alert.alert("Screen capture", error instanceof Error ? error.message : "Unable to start screen capture.");
    }
  };

  const stopCapture = async () => {
    await screenCapture.stop();
    setSharing(false);
  };

  const runAnalysis = async () => {
    if (observations.length === 0) {
      Alert.alert("No frames", "Start screen capture and collect at least one frame first.");
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeMobileObservations(
        { platform, symbol, tradeDuration, primaryTimeframe, selectedStrategies, visibleIndicators, selectedProvider, selectedModel },
        observations,
        previousAnalysis,
      );
      saveAnalysis(result);
      Alert.alert("Analysis complete", `${result.signal} · ${result.confidence}%`);
    } catch (error) {
      Alert.alert("Analysis failed", error instanceof Error ? error.message : "Unable to analyze frames.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>AI Trading Assistant</Text>
        <Text style={styles.subtitle}>Plan C · Native Android screen observation</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Symbol</Text>
          <TextInput value={symbol} onChangeText={(v) => setConfig("symbol", v)} placeholder="EUR/USD" placeholderTextColor="#71717a" style={styles.input} />
          <View style={styles.row}>
            <View style={styles.half}><Text style={styles.label}>Chart TF</Text><TextInput value={primaryTimeframe} onChangeText={(v) => setConfig("primaryTimeframe", v)} style={styles.input} /></View>
            <View style={styles.half}><Text style={styles.label}>Trade</Text><TextInput value={tradeDuration} onChangeText={(v) => setConfig("tradeDuration", v)} style={styles.input} /></View>
          </View>
          <Text style={styles.label}>Capture frequency</Text>
          <View style={styles.row}>
            {[15, 30, 60].map((seconds) => (
              <TouchableOpacity key={seconds} onPress={() => setFrequency(seconds)} style={[styles.choice, frequency === seconds && styles.choiceActive]}>
                <Text style={styles.choiceText}>{seconds}s</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}><Text style={styles.label}>Screen observation</Text><Text style={sharing ? styles.active : styles.muted}>{sharing ? "● ACTIVE" : "○ OFF"}</Text></View>
          <Text style={styles.small}>Android MediaProjection captures the trading screen even when you switch apps.</Text>
          <Text style={styles.frames}>Frames: {observations.length} / {MAX_OBSERVATIONS}</Text>
          <Text style={styles.small}>Readiness: {readiness}%</Text>
          <TouchableOpacity onPress={sharing ? stopCapture : startCapture} style={styles.primary}><Text style={styles.primaryText}>{sharing ? "Stop Screen Share" : "Start Screen Share"}</Text></TouchableOpacity>
          <TouchableOpacity onPress={clearObservations} style={styles.secondary}><Text style={styles.secondaryText}>Clear Frames</Text></TouchableOpacity>
        </View>

        {previousAnalysis && <View style={styles.card}><Text style={styles.label}>Previous analysis</Text><Text style={styles.signal}>{previousAnalysis.signal}</Text><Text style={styles.small}>Confidence: {previousAnalysis.confidence}%</Text></View>}
        {currentAnalysis && <View style={styles.card}><Text style={styles.label}>Latest signal</Text><Text style={styles.signal}>{currentAnalysis.signal}</Text><Text style={styles.small}>{currentAnalysis.explanation}</Text></View>}

        <TouchableOpacity disabled={isAnalyzing || observations.length === 0} onPress={runAnalysis} style={[styles.analyze, (isAnalyzing || observations.length === 0) && styles.disabled]}>
          <Text style={styles.primaryText}>{isAnalyzing ? "Analyzing…" : "Run AI Analysis"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09090b" },
  container: { padding: 18, gap: 14 },
  title: { color: "#fff", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#71717a", fontSize: 12 },
  card: { backgroundColor: "#18181b", borderRadius: 12, padding: 14, gap: 9 },
  label: { color: "#a1a1aa", fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: "#27272a", color: "#fff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1, gap: 6 },
  choice: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: "#27272a", alignItems: "center" },
  choiceActive: { backgroundColor: "#2563eb" },
  choiceText: { color: "#fff", fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between" },
  active: { color: "#4ade80", fontWeight: "800", fontSize: 11 },
  muted: { color: "#71717a", fontWeight: "800", fontSize: 11 },
  small: { color: "#71717a", fontSize: 11, lineHeight: 16 },
  frames: { color: "#e4e4e7", fontSize: 18, fontWeight: "800" },
  signal: { color: "#fff", fontSize: 22, fontWeight: "900" },
  primary: { backgroundColor: "#2563eb", padding: 13, borderRadius: 9, alignItems: "center", marginTop: 4 },
  analyze: { backgroundColor: "#16a34a", padding: 15, borderRadius: 10, alignItems: "center" },
  secondary: { backgroundColor: "#27272a", padding: 12, borderRadius: 9, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "800" },
  secondaryText: { color: "#d4d4d8", fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
