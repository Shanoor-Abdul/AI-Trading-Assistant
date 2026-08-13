import { z } from "zod";

export const UniversalAIRequestSchema = z.object({
  mode: z.enum(["visual_only", "api_data"]),
  provider: z.string(),
  model: z.string().optional(),
  platform: z.string(),
  symbol: z.string(),
  primaryTimeframe: z.string(),
  confirmationTimeframe: z.string().optional(),
  trendTimeframe: z.string().optional(),
  tradeDuration: z.string().optional(),
  selectedStrategies: z.array(z.string()).optional(),
  strategyRules: z.string().optional(),
  visibleIndicators: z.array(z.string()).default([]),
  screenshot: z.object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string()
  }).optional(),
  screenshots: z.array(z.object({
    timeframe: z.string(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string()
  })).optional(),
  marketData: z.any().optional(), // We'll keep this flexible for now as OHLCV/indicators shape varies
  previousAnalysis: z.any().optional(),
  riskContext: z.any().optional(),
});

export type UniversalAIRequest = z.infer<typeof UniversalAIRequestSchema>;

export const UniversalAIResponseSchema = z.object({
  trend: z.enum(["Bullish", "Bearish", "Sideways"]).catch("Sideways"),
  signal: z.enum(["STRONG_BUY", "BUY", "WAIT", "UNSURE", "NO_TRADE", "SELL", "STRONG_SELL"]).catch("NO_TRADE"),
  confidence: z.coerce.number().min(0).max(100),
  recommendedTimeframe: z.string(),
  entryPrice: z.union([z.number(), z.string().transform(Number)]).nullable().default(null),
  stopLoss: z.union([z.number(), z.string().transform(Number)]).nullable().default(null),
  takeProfit: z.union([z.number(), z.string().transform(Number)]).nullable().default(null),
  explanation: z.string(),
  requestedIndicators: z.array(z.string()).default([]),
  requiredTimeframe: z.string().nullable().default(null),
  detectedSymbol: z.string().nullable().default(null),
  detectedTimeframe: z.string().nullable().default(null),
  exchange: z.string().nullable().default(null),
  marketProvider: z.enum(["visual_only", "ccxt", "broker_api", "unknown"]).default("unknown"),
  riskDecision: z.string().default("UNSURE"),
  reasoning: z.string().default("No reasoning provided"),
  dataConfidence: z.coerce.number().min(0).max(100).default(0),
  riskReward: z.number().optional(),
});

export type UniversalAIResponse = z.infer<typeof UniversalAIResponseSchema>;
