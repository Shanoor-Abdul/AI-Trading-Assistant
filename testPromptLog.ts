import { buildUniversalPrompt } from "./src/lib/ai/universalPrompt";
import { buildPriceLevelInstruction } from "./src/lib/ai/priceLevelPrompt";
import { buildCandlestickReferenceInstruction } from "./src/lib/ai/candlestickKnowledge";
import { buildMobileExtractionPrompt } from "./src/lib/ai/mobileExtractionPrompt";
import { UniversalAIRequest } from "./src/lib/ai/schema";

const req = {
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
  symbol: "EURUSD",
  primaryTimeframe: "5m",
  rawOutput: true
} as UniversalAIRequest;
req.promptOverride = buildMobileExtractionPrompt(req);

const prompt = req.promptOverride ? req.promptOverride : (buildUniversalPrompt(req) + buildPriceLevelInstruction(req) + buildCandlestickReferenceInstruction());
require("fs").writeFileSync("anthropic_prompt.txt", prompt);
console.log("Wrote anthropic_prompt.txt");

