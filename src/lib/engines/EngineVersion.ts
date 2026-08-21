export const ENGINE_VERSION = "FastSignal_v3.0.0_Strict_HardGate";
export const PROMPT_VERSION = "UniversalVision_v2.5.0_NoHallucinations";
export const VALIDATION_MODE = "FORWARD_PAPER_TRADING";

export const ENGINE_THRESHOLDS = {
  minConfluenceGroups: 3,
  minRiskReward: 1.2,
  maxContradictions: 0,
} as const;

export function getEngineConfigMetrics() {
  return {
    engineVersion: ENGINE_VERSION,
    promptVersion: PROMPT_VERSION,
    validationMode: VALIDATION_MODE,
    thresholds: ENGINE_THRESHOLDS,
  };
}
