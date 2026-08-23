import { analyze } from "./src/lib/ai/index";
import fs from "fs";

async function run() {
  try {
    const res = await analyze({
      symbol: "BTCUSDT",
      timeframe: "1m",
      platform: "BINANCE",
      marketDataMode: "visual_only",
      provider: "openrouter", model: "gpt-4o",
      isProgressive: true,
      screenshots: [
        { timeframe: "1m", mimeType: "image/jpeg", base64: "dummy" },
        { timeframe: "1m", mimeType: "image/jpeg", base64: "dummy" }
      ]
    } as any);
    console.log("Success:", res);
  } catch(e: any) {
    console.error("FAILED:", e.stack);
  }
}
run();
