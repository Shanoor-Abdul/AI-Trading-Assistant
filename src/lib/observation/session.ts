import { ObservationSessionConfig } from "../types";

export function createObservationSessionKey(config: ObservationSessionConfig): string {
  // Extract and stabilize arrays
  const stableConfig = {
    ...config,
    selectedStrategies: [...(config.selectedStrategies || [])].sort(),
    visibleIndicators: [...(config.visibleIndicators || [])].sort()
  };
  
  return JSON.stringify(stableConfig);
}
