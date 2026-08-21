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
  };
}
