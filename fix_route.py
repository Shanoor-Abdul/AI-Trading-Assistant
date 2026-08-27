
import os

with open("src/app/api/mobile-analyze/route.ts", "r", encoding="utf-8") as f:
    content = f.read()

# We will completely replace the POST handler in route.ts
new_post = """export async function POST(request: NextRequest) {
  const started = performance.now();
  try {
    const body = await request.json();
    const rawImage = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
    if (!rawImage && !body?.extractedTextData) return NextResponse.json({ error: "A chart screenshot or text data is required.", code: "MOBILE_IMAGE_MISSING", analysisType: "mobile_visual" }, { status: 400 });
    if (!body?.symbol || !body?.timeframe || !body?.tradeDuration) return NextResponse.json({ error: "symbol, timeframe and tradeDuration are required.", code: "MOBILE_SETTINGS_MISSING", analysisType: "mobile_visual" }, { status: 400 });

    const provider = typeof body.provider === "string" ? body.provider : "gemini";
    const model = typeof body.model === "string" && body.model.trim() ? body.model : undefined;
    const capabilities = getModelCapabilities(provider, model || "");
    if (!capabilities) return NextResponse.json({ error: `Unknown AI provider/model: ${provider}/${model || "default"}`, code: "MOBILE_MODEL_UNKNOWN", analysisType: "mobile_visual" }, { status: 400 });
    
    // Stage 1: Extraction
    const image = rawImage ? getMimeAndBase64(rawImage) : undefined;
    const baseRequest1 = UniversalAIRequestSchema.parse({
      mode: "visual_only", provider, model, platform: String(body.platform || "Unknown"), symbol: String(body.symbol), primaryTimeframe: String(body.timeframe), tradeDuration: String(body.tradeDuration),
      selectedStrategies: Array.isArray(body.selectedStrategies) ? body.selectedStrategies : ["Auto (AI Selection)"],
      visibleIndicators: Array.isArray(body.visibleIndicators) ? body.visibleIndicators : [], screenshot: image, promptOverride: "", rawOutput: true, isProgressive: false,
    });

    const stage1Prompt = `STAGE 1: RAW EXTRACTION
You are a pure data extraction tool. Extract exact numbers and values from the provided ${rawImage ? "chart screenshot" : "scraped text"}.
${body.extractedTextData ? "Scraped Text Data:\\n" + body.extractedTextData : ""}

Requested Indicators: ${(baseRequest1.visibleIndicators || []).join(", ")}

Return ONLY valid JSON matching this schema:
{
  "currentPrice": number | null,
  "completedCandle": { "open": number | null, "high": number | null, "low": number | null, "close": number | null, "direction": "Bullish" | "Bearish" | "UNKNOWN" },
  "indicators": {
    "RSI": { "value": number | null, "state": "string", "visible": boolean },
    "MACD": { "value": number | null, "state": "string", "visible": boolean },
    "Bollinger Bands": { "value": number | null, "state": "string", "visible": boolean }
  },
  "supportLevels": [number],
  "resistanceLevels": [number],
  "visualObservations": ["string"]
}
`;

    // Execute Stage 1
    const stage1Raw = await callProvider({ ...baseRequest1, promptOverride: stage1Prompt, rawOutput: true });
    
    // Parse and Validate Stage 1 output
    let stage1Data;
    try {
      // Find JSON block in raw output
      const jsonMatch = typeof stage1Raw === "string" ? stage1Raw.match(/\{[\s\S]*\}/) : null;
      const jsonString = jsonMatch ? jsonMatch[0] : (typeof stage1Raw === "string" ? stage1Raw : JSON.stringify(stage1Raw));
      stage1Data = JSON.parse(jsonString);
    } catch(e) {
      stage1Data = { currentPrice: null, indicators: {}, visualObservations: ["Failed to parse Stage 1 JSON"] };
    }
    
    // Server Validation (Sanity Checks)
    if (stage1Data.indicators?.RSI?.value !== null && (stage1Data.indicators?.RSI?.value < 0 || stage1Data.indicators?.RSI?.value > 100)) {
        stage1Data.indicators.RSI.value = null; // Kill hallucinated RSI
    }

    // Stage 2: Reasoning (Text Only)
    const baseRequest2 = UniversalAIRequestSchema.parse({
      mode: "visual_only", provider, model, platform: String(body.platform || "Unknown"), symbol: String(body.symbol), primaryTimeframe: String(body.timeframe), tradeDuration: String(body.tradeDuration),
      selectedStrategies: Array.isArray(body.selectedStrategies) ? body.selectedStrategies : ["Auto (AI Selection)"],
      visibleIndicators: Array.isArray(body.visibleIndicators) ? body.visibleIndicators : [], promptOverride: "", rawOutput: true, isProgressive: false,
    });
    
    const stage2Prompt = `STAGE 2: TRADING DECISION GATE
You are a Quantitative Trading Logic AI for a ${body.tradeDuration} trade on ${body.symbol}.

Market Evidence (Validated from Stage 1):
${JSON.stringify(stage1Data, null, 2)}

THE SETUP STATE MACHINE:
Evaluate the evidence and classify the current market state into ONE of the following:
1. NO_SETUP: Market is flat, chopping randomly in the middle of a range. -> Signal: NO_TRADE
2. DEVELOPING: Price is approaching a key level (e.g., Bollinger Band or Support) but hasn't touched it yet. -> Signal: WAIT
3. WAITING_CONFIRMATION: Price has touched the level, setup exists, but we need candle confirmation. -> Signal: WAIT
4. CONFIRMED: Price touched level, momentum is reacting, candles confirm the direction. -> Signal: BUY or SELL
5. INVALIDATED: Setup formed, but price aggressively broke through the level instead of bouncing. -> Signal: NO_TRADE

CONTRADICTION DETECTION:
Before outputting CONFIRMED, check for contradictions. If RSI is Overbought but MACD is Bullish, that is a contradiction -> WAITING_CONFIRMATION.

OUTPUT REQUIREMENTS:
Return ONLY valid JSON matching this schema:
{
  "setupState": "NO_SETUP" | "DEVELOPING" | "WAITING_CONFIRMATION" | "CONFIRMED" | "INVALIDATED",
  "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "signal": "BUY" | "SELL" | "WAIT" | "NO_TRADE",
  "entryTrigger": "What exactly must happen to execute this trade?",
  "invalidationConditions": ["If price hits X, trade is invalid"],
  "entryPrice": number | null,
  "takeProfit": number | null,
  "stopLoss": number | null,
  "confidence": number,
  "reasoning": "Step-by-step logic justifying the state machine decision."
}`;

    // Execute Stage 2 (Notice: no screenshot attached so it runs faster as text-only if provider supports it)
    const stage2Raw = await callProvider({ ...baseRequest2, promptOverride: stage2Prompt, rawOutput: true });
    
    let stage2Data;
    try {
      const jsonMatch2 = typeof stage2Raw === "string" ? stage2Raw.match(/\{[\s\S]*\}/) : null;
      const jsonString2 = jsonMatch2 ? jsonMatch2[0] : (typeof stage2Raw === "string" ? stage2Raw : JSON.stringify(stage2Raw));
      stage2Data = JSON.parse(jsonString2);
    } catch(e) {
      stage2Data = { setupState: "NO_SETUP", direction: "NEUTRAL", signal: "WAIT", confidence: 0, reasoning: "Failed to parse Stage 2 JSON." };
    }

    // Map to UniversalAIResponseSchema to satisfy the frontend UI
    const finalData = {
      trend: stage2Data.direction === "BULLISH" ? "Bullish" : (stage2Data.direction === "BEARISH" ? "Bearish" : "Sideways"),
      signal: stage2Data.signal || "WAIT",
      marketState: `State: ${stage2Data.setupState}. Trigger: ${stage2Data.entryTrigger}`,
      entryPrice: stage2Data.entryPrice || stage1Data.currentPrice || null,
      takeProfit: stage2Data.takeProfit || null,
      stopLoss: stage2Data.stopLoss || null,
      confidence: stage2Data.confidence || 0,
      reasoning: stage2Data.reasoning || "No reasoning provided",
      explanation: `Setup: ${stage2Data.setupState}. ${stage2Data.reasoning}`,
      invalidationConditions: stage2Data.invalidationConditions || [],
      unifiedMarketData: {
        currentPrice: { value: stage1Data.currentPrice || 0, confidence: 90 },
        indicators: stage1Data.indicators || {}
      }
    };

    const validated = UniversalAIResponseSchema.parse(finalData);

    return NextResponse.json({
      ...validated,
      analysisType: "mobile_visual",
      extractionOnly: false,
      source: "mobile_two_stage_pipeline",
      timings: { totalMs: performance.now() - started },
    });
  } catch (error: any) {
    console.error("[Mobile Analysis API Error]", error);
    return NextResponse.json({ error: error?.message || "Mobile chart analysis failed", code: "MOBILE_ANALYSIS_FAILED", analysisType: "mobile_visual" }, { status: 500 });
  }
}
"""

import re
content = re.sub(r"export async function POST\(request: NextRequest\).*?}(?=\s*$)", new_post, content, flags=re.DOTALL)

with open("src/app/api/mobile-analyze/route.ts", "w", encoding="utf-8") as f:
    f.write(content)


