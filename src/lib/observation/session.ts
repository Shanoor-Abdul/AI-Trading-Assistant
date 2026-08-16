import { ObservationSessionConfig } from "../types";

export function createObservationSessionKey(config: ObservationSessionConfig): string {
  // A model change must not invalidate the captured visual evidence. The model
  // only changes how the existing evidence is interpreted. Model changes are
  // handled separately by the store by invalidating prior AI conclusions.
  // Execution mode is intentionally not part of this key either because it
  // does not change the chart evidence.
  const {
    provider: _provider,
    model: _model,
    ...observationConfig
  } = config;

  const stableConfig = {
    ...observationConfig,
    selectedStrategies: [...(observationConfig.selectedStrategies || [])].sort(),
    visibleIndicators: [...(observationConfig.visibleIndicators || [])].sort(),
  };

  return JSON.stringify(stableConfig);
}
