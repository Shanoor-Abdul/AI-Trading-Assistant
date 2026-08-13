import { normalizeResponse } from "./src/lib/ai/normalizeResponse";

const testCases = [
  {
    name: "Standard Markdown JSON",
    input: "```json\n{\"trend\":\"Bullish\",\"signal\":\"BUY\",\"confidence\":80,\"recommendedTimeframe\":\"5m\",\"entryPrice\":123.45,\"stopLoss\":120.0,\"takeProfit\":130.0,\"explanation\":\"Good\",\"reasoning\":\"Good\",\"dataConfidence\":90}\n```"
  },
  {
    name: "Missing entry price (null)",
    input: "{\"trend\":\"Sideways\",\"signal\":\"WAIT\",\"confidence\":50,\"recommendedTimeframe\":\"5m\",\"explanation\":\"Wait\"}"
  },
  {
    name: "UNSURE with requested timeframe",
    input: "{\"trend\":\"Sideways\",\"signal\":\"UNSURE\",\"confidence\":40,\"recommendedTimeframe\":\"5m\",\"requiredTimeframe\":\"15m\",\"requestedIndicators\":[\"RSI\"],\"explanation\":\"Need more info\"}"
  }
];

let allPassed = true;
for (const tc of testCases) {
  try {
    const res = normalizeResponse(tc.input);
    console.log(`[PASS] ${tc.name}`);
    if (tc.name === "Missing entry price (null)" && res.entryPrice !== null) {
      console.error("  -> FAILED: entryPrice was not null, it was", res.entryPrice);
      allPassed = false;
    }
    if (tc.name === "Missing entry price (null)" && res.requiredTimeframe !== null) {
      console.error("  -> FAILED: requiredTimeframe was not null, it was", res.requiredTimeframe);
      allPassed = false;
    }
    if (tc.name === "UNSURE with requested timeframe" && res.requiredTimeframe !== "15m") {
      console.error("  -> FAILED: requiredTimeframe was not 15m");
      allPassed = false;
    }
  } catch (e) {
    console.error(`[FAIL] ${tc.name}:`, e);
    allPassed = false;
  }
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log("All normalization tests passed!");
}
