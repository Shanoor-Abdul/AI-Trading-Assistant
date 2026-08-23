import { analyze } from "./src/lib/ai/index";
import fs from "fs";
import path from "path";

async function run() {
  try {
    const dir = "debug_frames";
    const files = fs.readdirSync(dir).filter(f => f.includes("2026-08-22T22-22-29-970Z_frame_"));
    const screenshots = files.map((f, i) => {
      const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
      return { timeframe: "1m", mimeType: "image/png", base64: b64 };
    });

    console.log(`Loaded ${screenshots.length} screenshots. Running analyze...`);

    const res = await analyze({
      symbol: "BTCUSDT",
      timeframe: "1m",
      platform: "BINANCE",
      marketDataMode: "visual_only",
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      isProgressive: true,
      screenshots: screenshots
    } as any);

    console.log("Success!");
    fs.writeFileSync("debug_frames/test_success.json", JSON.stringify(res, null, 2));
  } catch(e: any) {
    console.error("FAILED:", e.stack);
    fs.writeFileSync("debug_frames/test_error.txt", e.stack || e.message);
  }
}
run();
