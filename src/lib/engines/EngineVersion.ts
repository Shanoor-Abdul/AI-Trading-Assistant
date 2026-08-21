<<<<<<< HEAD
export const CURRENT_ENGINE_VERSION = "FastSignal_v3.1.0_VisualEvidenceHardGate";
export const CURRENT_PROMPT_VERSION = "UniversalVision_v3.0.0_StructuredEvidence";

export function getEngineConfigMetrics() {
  return {
    engineVersion: CURRENT_ENGINE_VERSION,
    promptVersion: CURRENT_PROMPT_VERSION,
    thresholds: {
      minConfluenceGroups: 3,
      minRiskReward: 1.2,
      maxContradictions: 0,
    },
    validationMode: "FORWARD_PAPER_TRADING",
=======
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
>>>>>>> feature/ai-signal-accuracy2
  };
}
