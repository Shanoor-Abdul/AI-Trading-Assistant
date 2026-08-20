import type { Signal, Trend, UnifiedMarketContext } from "@/lib/types";
import { analyzeTemporalEvidence, collectFrameObservations } from "./TemporalEvidenceEngine";

export interface FastSignalInput {
  symbol: string;
  timeframe: string;
  tradeDuration?: string;
  platform?: string;
  market?: Partial<UnifiedMarketContext> & Record<string, any>;
  progressive?: any;
  performance?: any;
}

export interface FastSignalResult {
  trend: Trend;
  primaryTrend?: string;
  shortTermDirection?: string;
  structureTransition?: string;
  signal: Signal;
  confidence: number;
  dataConfidence: number;
  signalQuality: "GOOD" | "FAIR" | "POOR" | "AVOID";
  readiness: "READY" | "GOOD" | "FAIR" | "NOT READY";
  marketState: string;
  momentum: string;
  strategyConsensus: string;
  bullishEvidence: string[];
  bearishEvidence: string[];
  invalidationConditions: string[];
  explanation: string;
  latencyMode: "LOCAL_TEXT";
  generatedAt: number;
  evidenceScore: number;
  marketRegime: "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "BREAKOUT" | "REVERSAL" | "UNCLEAR";
  selectedStrategy: string;
  riskReward: number | null;
  transition: string;
  currentFrameCount: number;
}

function text(value: any): string {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  return String(raw ?? "").trim();
}

function numeric(value: any): number | null {
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function direction(value: any): "bull" | "bear" | "neutral" {
  const v = text(value).toLowerCase();
  if (/(bull|upward|rising|positive|buy|higher high|higher low|green|above support|bounce|recovery|improving)/.test(v)) return "bull";
  if (/(bear|downward|falling|negative|sell|lower high|lower low|red|below resistance|rejection|weakening)/.test(v)) return "bear";
  return "neutral";
}

function strategyForRegime(regime: FastSignalResult["marketRegime"]): string {
  switch (regime) {
    case "TRENDING_UP":
    case "TRENDING_DOWN": return "Trend Following / Momentum";
    case "BREAKOUT": return "Breakout / Support-Resistance";
    case "REVERSAL": return "Reversal / Price Action";
    case "RANGING": return "Mean Reversion / Support-Resistance";
    default: return "Confirmation / No-Trade";
  }
}

function nearestBelow(price: number | null, levels: any): number | null {
  if (price === null) return null;
  const values = Array.isArray(levels) ? levels.map(numeric).filter((n): n is number => n !== null && n < price) : [];
  return values.length ? Math.max(...values) : null;
}

function nearestAbove(price: number | null, levels: any): number | null {
  if (price === null) return null;
  const values = Array.isArray(levels) ? levels.map(numeric).filter((n): n is number => n !== null && n > price) : [];
  return values.length ? Math.min(...values) : null;
}

function buildPseudoProgressive(market: any, progressive: any): any {
  const existing = Array.isArray(progressive) ? progressive : [];
  if (existing.length || !market) return existing;
  const unified = market.unifiedMarketData || market;
  return [{
    batchId: 0,
    status: "PARTIAL",
    confidence: numeric(unified?.dataConfidence) ?? 75,
    trend: text(unified?.trend),
    momentum: text(unified?.momentum),
    marketState: text(unified?.marketStructure),
    unifiedMarketData: {
      ...unified,
      frameObservations: [{
        isPartial: true,
        price: unified?.currentPrice,
        currentDirection: unified?.trend,
        shortTermDirection: unified?.trend,
        structure: unified?.marketStructure,
        momentum: unified?.momentum,
        indicators: unified?.indicators || {},
        levels: {
          supportLevels: unified?.supportLevels,
          resistanceLevels: unified?.resistanceLevels,
        },
      }],
    },
  }];
}

/**
 * Local, deterministic signal gate. It never receives screenshots and never
 * calls a model. Progressive Vision is responsible for producing the evidence.
 * The engine reasons over temporal observations, giving the newest/current
 * state more authority than stale batches and distinguishing reversals from
 * simple trend labels.
 */
export function generateFastSignal(input: FastSignalInput): FastSignalResult {
  const started = Date.now();
  const progressive = buildPseudoProgressive(input.market, input.progressive);
  const temporal = analyzeTemporalEvidence(progressive);
  const frames = collectFrameObservations(progressive);
  const latest = temporal.currentObservation || {};

  const bullish = temporal.bullishScore;
  const bearish = temporal.bearishScore;
  const dominant = Math.max(bullish, bearish);
  const gap = Math.abs(bullish - bearish);
  const bullishLead = bullish > bearish;
  const bearishLead = bearish > bullish;
  const currentDir = temporal.currentDirection;
  const currentSupportsBull = currentDir === "bull" || direction(latest?.momentum) === "bull";
  const currentSupportsBear = currentDir === "bear" || direction(latest?.momentum) === "bear";

  const selectedStrategy = strategyForRegime(temporal.marketRegime);
  const bullishGroups = temporal.bullishGroups;
  const bearishGroups = temporal.bearishGroups;

  const bullishEvidence = bullishGroups.slice(0, 7).map((group) => {
    const names: Record<string, string> = {
      structure: "Recent market structure supports upside.",
      candle: "Recent candle behavior supports upside.",
      momentum: "Recent momentum supports upside.",
      support: "Price is holding or bouncing from support.",
      batchTrend: "Recent progressive trend context supports upside.",
      batchMomentum: "Recent progressive momentum supports upside.",
      batchStructure: "Recent progressive structure supports upside.",
    };
    return names[group] || `${group.replace(/^indicator:/, "")} provides bullish evidence.`;
  });
  const bearishEvidence = bearishGroups.slice(0, 7).map((group) => {
    const names: Record<string, string> = {
      structure: "Recent market structure supports downside.",
      candle: "Recent candle behavior supports downside.",
      momentum: "Recent momentum supports downside.",
      resistance: "Price is being rejected at resistance.",
      batchTrend: "Recent progressive trend context supports downside.",
      batchMomentum: "Recent progressive momentum supports downside.",
      batchStructure: "Recent progressive structure supports downside.",
    };
    return names[group] || `${group.replace(/^indicator:/, "")} provides bearish evidence.`;
  });

  // A reversal is not a BUY/SELL merely because the latest candle changed color.
  // It needs current evidence from at least three independent groups and a
  // clear lead over the opposing thesis.
  const currentEvidenceGroups = currentDir === "bull" ? temporal.independentBullish : temporal.independentBearish;
  const currentConfirmation = currentEvidenceGroups >= 3 && temporal.temporalAgreement >= 0.62;
  const unresolvedTransition = temporal.transition === "REVERSAL_DEVELOPING" || temporal.transition === "PULLBACK" || temporal.transition === "RECOVERY";

  let signal: Signal = "WAIT";
  if (
    bullishLead &&
    currentSupportsBull &&
    currentConfirmation &&
    !unresolvedTransition &&
    gap >= 3
  ) signal = "BUY";
  else if (
    bearishLead &&
    currentSupportsBear &&
    currentConfirmation &&
    !unresolvedTransition &&
    gap >= 3
  ) signal = "SELL";
  else if (temporal.transition === "REVERSAL_CONFIRMED" && currentEvidenceGroups >= 3 && gap >= 4) {
    signal = bullishLead ? "BUY" : bearishLead ? "SELL" : "WAIT";
  }

  // Strong signals require more than a directional vote. This prevents an old
  // bearish batch from overriding a current bullish recovery and also prevents
  // one bullish candle from becoming an instant BUY.
  if (signal !== "WAIT" && (currentEvidenceGroups < 3 || temporal.temporalAgreement < 0.55)) {
    signal = "WAIT";
  }

  let trend: Trend = "Sideways";
  if (currentDir === "bull" || (bullishLead && !bearishLead)) trend = "Bullish";
  else if (currentDir === "bear" || bearishLead) trend = "Bearish";

  const unified = (input.market?.unifiedMarketData || latest || {}) as any;
  const price = numeric(unified?.currentPrice ?? latest?.price ?? latest?.currentPrice);
  const supportLevels = unified?.supportLevels?.value ?? unified?.supportLevels ?? latest?.levels?.supportLevels?.value ?? latest?.levels?.supportLevels;
  const resistanceLevels = unified?.resistanceLevels?.value ?? unified?.resistanceLevels ?? latest?.levels?.resistanceLevels?.value ?? latest?.levels?.resistanceLevels;
  const support = nearestBelow(price, supportLevels);
  const resistance = nearestAbove(price, resistanceLevels);
  const entryPrice = signal === "BUY" || signal === "SELL" ? price : null;
  const stopLoss = signal === "BUY" ? support : signal === "SELL" ? resistance : null;
  const takeProfit = signal === "BUY" ? resistance : signal === "SELL" ? support : null;
  const risk = entryPrice !== null && stopLoss !== null ? Math.abs(entryPrice - stopLoss) : null;
  const reward = entryPrice !== null && takeProfit !== null ? Math.abs(takeProfit - entryPrice) : null;
  const riskReward = risk && reward !== null && risk > 0 ? reward / risk : null;

  const evidenceScore = Math.min(100, Math.round(
    Math.min(45, dominant * 2.7) +
    Math.min(20, gap * 2.2) +
    Math.min(20, currentEvidenceGroups * 5) +
    (temporal.temporalAgreement >= 0.8 ? 10 : temporal.temporalAgreement >= 0.67 ? 6 : temporal.temporalAgreement >= 0.55 ? 3 : 0) +
    (riskReward !== null && riskReward >= 1.5 ? 5 : 0),
  ));

  const dataConfidence = Math.min(95, Math.max(0, temporal.dataConfidence));
  const confidenceBase = signal === "WAIT"
    ? 45 + Math.min(18, gap * 2) + Math.min(12, currentEvidenceGroups * 3)
    : 58 + Math.min(18, gap * 2.4) + Math.min(12, currentEvidenceGroups * 3) + (temporal.temporalAgreement >= 0.8 ? 7 : 0);
  const confidence = Math.round(Math.min(dataConfidence, Math.min(94, confidenceBase), Math.max(35, evidenceScore)));

  const quality: FastSignalResult["signalQuality"] = signal === "WAIT"
    ? (confidence >= 60 ? "FAIR" : "POOR")
    : confidence >= 82 && currentEvidenceGroups >= 4 ? "GOOD" : "FAIR";
  const readiness: FastSignalResult["readiness"] = signal === "WAIT"
    ? "NOT READY"
    : confidence >= 82 && currentEvidenceGroups >= 4 ? "READY" : "GOOD";

  const regime = temporal.marketRegime;
  const marketState = text(
    latest?.marketState ||
    latest?.regimeDescription ||
    input.market?.marketState ||
    input.market?.unifiedMarketData?.marketStructure,
  ) || `${regime.replace(/_/g, " ").toLowerCase()} market state`;
  const momentum = text(latest?.momentum || input.market?.momentum || input.market?.unifiedMarketData?.momentum) || "Unknown";

  const explanation = signal === "WAIT"
    ? `Current evidence is not sufficiently confirmed for entry. Latest state is ${temporal.transition.replace(/_/g, " ").toLowerCase()} with ${currentEvidenceGroups} independent current evidence groups.`
    : `Current ${signal} direction is supported by ${currentEvidenceGroups} independent evidence groups after weighting the newest observations above stale history.`;

  return {
    trend,
    
    signal,
    confidence,
    dataConfidence: 85,
    signalQuality: quality,
    readiness,
    marketState,
    momentum,
    strategyConsensus: signal === "BUY" ? "Bullish" : signal === "SELL" ? "Bearish" : bullishLead ? "Bullish but unconfirmed" : bearishLead ? "Bearish but unconfirmed" : "Mixed",
    bullishEvidence,
    bearishEvidence,
    invalidationConditions: signal === "BUY"
      ? ["Current bullish structure or momentum fails.", "Price loses the latest supporting structure."]
      : signal === "SELL"
        ? ["Current bearish structure or momentum fails.", "Price reclaims the latest opposing structure."]
        : ["Wait for at least three independent current evidence groups to align.", "Do not enter while a reversal or recovery remains unconfirmed."],
    explanation,
    latencyMode: "LOCAL_TEXT",
    generatedAt: started,
    evidenceScore,
    marketRegime: ["CONTINUATION", "RECOVERY"].includes(temporal.transition) ? "TRENDING_UP" : ["CONTINUATION", "PULLBACK"].includes(temporal.transition) ? "TRENDING_DOWN" : "RANGING",
    selectedStrategy: "Temporal Validation Engine",
    riskReward,
    transition: temporal.transition,
    currentFrameCount: frames.length,
  };
}
