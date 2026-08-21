import { z } from "zod";

const NumericObservationSchema = z.object({
  value: z.number().finite().nullable().default(null),
  source: z.enum(["visual", "api", "hybrid"]).default("visual"),
  confidence: z.coerce.number().min(0).max(100).default(0),
});

const NumericObservationDefault = { value: null, source: "visual" as const, confidence: 0 };

const IndicatorValueSchema = z.object({
  value: z.number().finite().nullable().default(null),
  state: z.string().default("UNKNOWN"),
  visible: z.boolean().default(false),
  confidence: z.coerce.number().min(0).max(100).default(0),
  source: z.enum(["visual", "api", "hybrid"]).default("visual"),
}).passthrough();

const MacdObservationSchema = z.object({
  macd: z.number().finite().nullable().default(null),
  signal: z.number().finite().nullable().default(null),
  histogram: z.number().finite().nullable().default(null),
  state: z.string().default("UNKNOWN"),
  visible: z.boolean().default(false),
  confidence: z.coerce.number().min(0).max(100).default(0),
  source: z.enum(["visual", "api", "hybrid"]).default("visual"),
}).passthrough();

const BollingerObservationSchema = z.object({
  upper: z.number().finite().nullable().default(null),
  middle: z.number().finite().nullable().default(null),
  lower: z.number().finite().nullable().default(null),
  position: z.string().default("UNKNOWN"),
  state: z.string().default("UNKNOWN"),
  visible: z.boolean().default(false),
  confidence: z.coerce.number().min(0).max(100).default(0),
  source: z.enum(["visual", "api", "hybrid"]).default("visual"),
}).passthrough();

const IndicatorSetSchema = z.object({
  RSI: IndicatorValueSchema.optional(),
  MACD: MacdObservationSchema.optional(),
  "Bollinger Bands": BollingerObservationSchema.optional(),
  BollingerBands: BollingerObservationSchema.optional(),
  ATR: IndicatorValueSchema.optional(),
  EMA: z.record(z.string(), IndicatorValueSchema).optional(),
  volume: IndicatorValueSchema.optional(),
}).passthrough();

const PriceLevelSchema = z.object({
  value: z.number().finite().nullable().default(null),
  price: z.number().finite().nullable().default(null),
  type: z.string().optional(),
  strength: z.coerce.number().min(0).max(100).default(0),
  confidence: z.coerce.number().min(0).max(100).default(0),
  interaction: z.string().optional(),
}).passthrough();

const LevelsDefault = {
  supportLevels: [] as z.infer<typeof PriceLevelSchema>[],
  resistanceLevels: [] as z.infer<typeof PriceLevelSchema>[],
  supportInteraction: "",
  resistanceInteraction: "",
  breakoutLevel: null,
  invalidationLevel: null,
};

const CandleSchema = z.object({
  open: z.number().finite().nullable().default(null),
  high: z.number().finite().nullable().default(null),
  low: z.number().finite().nullable().default(null),
  close: z.number().finite().nullable().default(null),
  complete: z.boolean().default(false),
}).passthrough();

const FrameObservationSchema = z.object({
  frameIndex: z.coerce.number().int().nonnegative(),
  timestamp: z.union([z.string(), z.number()]).nullable().default(null),
  timeframe: z.string().default(""),
  isPartial: z.boolean().default(false),
  price: z.number().finite().nullable().default(null),
  completedCandle: CandleSchema.nullable().default(null),
  currentIncompleteCandle: CandleSchema.nullable().default(null),
  trend: z.string().default("Unknown"),
  shortTermDirection: z.string().default("Unknown"),
  structure: z.string().default(""),
  momentum: z.string().default(""),
  candleBehavior: z.string().default(""),
  indicators: IndicatorSetSchema.default({}),
  levels: z.object({
    supportLevels: z.array(PriceLevelSchema).default([]),
    resistanceLevels: z.array(PriceLevelSchema).default([]),
    supportInteraction: z.string().default(""),
    resistanceInteraction: z.string().default(""),
    breakoutLevel: z.number().finite().nullable().default(null),
    invalidationLevel: z.number().finite().nullable().default(null),
  }).default(LevelsDefault),
  swingHigh: z.number().finite().nullable().default(null),
  swingLow: z.number().finite().nullable().default(null),
  marketRegime: z.string().default("UNCLEAR"),
  bullishEvidenceGroups: z.array(z.string()).default([]),
  bearishEvidenceGroups: z.array(z.string()).default([]),
  invalidation: z.array(z.string()).default([]),
  confidence: z.coerce.number().min(0).max(100).default(0),
}).passthrough();

const UnifiedMarketDataSchema = z.object({
  symbol: z.string().default(""),
  timeframe: z.string().default(""),
  currentPrice: NumericObservationSchema.default(NumericObservationDefault),
  completedCandle: CandleSchema.nullable().default(null),
  currentIncompleteCandle: CandleSchema.nullable().default(null),
  volume: NumericObservationSchema.default(NumericObservationDefault),
  bidAskSpread: NumericObservationSchema.default(NumericObservationDefault),
  supportLevels: z.object({ value: z.array(PriceLevelSchema).default([]), source: z.enum(["visual", "api", "hybrid"]).default("visual"), confidence: z.coerce.number().min(0).max(100).default(0) }).default({ value: [], source: "visual", confidence: 0 }),
  resistanceLevels: z.object({ value: z.array(PriceLevelSchema).default([]), source: z.enum(["visual", "api", "hybrid"]).default("visual"), confidence: z.coerce.number().min(0).max(100).default(0) }).default({ value: [], source: "visual", confidence: 0 }),
  indicators: IndicatorSetSchema.default({}),
