import { analyze } from "./src/lib/ai/providers/anthropic";
import { buildMobileExtractionPrompt } from "./src/lib/ai/mobileExtractionPrompt";

async function run() {
  const req = {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    symbol: "EURUSD",
    primaryTimeframe: "5m",
    rawOutput: true
  } as any;
  req.promptOverride = buildMobileExtractionPrompt(req);
  console.log("Calling analyze...");
  try {
    await analyze(req);
  } catch (e) {
    console.error(e.message);
  }
}
run();
