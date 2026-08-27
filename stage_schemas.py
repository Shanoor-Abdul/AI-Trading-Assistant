
import os

with open("src/lib/ai/schema.ts", "a", encoding="utf-8") as f:
    f.write("""

// --- NEW PIPELINE SCHEMAS ---

export const Stage1ExtractionSchema = z.object({
  currentPrice: z.coerce.number().nullable().default(null),
  completedCandle: z.object({
    open: z.coerce.number().nullable().default(null),
    high: z.coerce.number().nullable().default(null),
    low: z.coerce.number().nullable().default(null),
    close: z.coerce.number().nullable().default(null),
    direction: z.string().default("UNKNOWN")
  }).nullable().default(null),
  indicators: z.record(z.object({
    value: z.coerce.number().nullable().default(null),
    state: z.string().default("UNKNOWN"),
    visible: z.boolean().default(false)
  })).default({}),
  supportLevels: z.array(z.coerce.number()).default([]),
  resistanceLevels: z.array(z.coerce.number()).default([]),
  visualObservations: z.array(z.string()).default([])
}).passthrough();

export type Stage1Extraction = z.infer<typeof Stage1ExtractionSchema>;

export const Stage2DecisionSchema = z.object({
  setupState: z.enum(["NO_SETUP", "DEVELOPING", "WAITING_CONFIRMATION", "CONFIRMED", "INVALIDATED"]).default("NO_SETUP"),
  direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]).default("NEUTRAL"),
  signal: z.enum(["BUY", "SELL", "WAIT", "NO_TRADE", "UNSURE"]).default("NO_TRADE"),
  entryTrigger: z.string().default(""),
  invalidationConditions: z.array(z.string()).default([]),
  entryPrice: z.coerce.number().nullable().default(null),
  takeProfit: z.coerce.number().nullable().default(null),
  stopLoss: z.coerce.number().nullable().default(null),
  confidence: z.coerce.number().min(0).max(100).default(0),
  reasoning: z.string().default("")
}).passthrough();

export type Stage2Decision = z.infer<typeof Stage2DecisionSchema>;
""")

