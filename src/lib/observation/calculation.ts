import { parseDurationToSeconds } from "./timeframe";

export const PROGRESSIVE_BATCH_SIZE = 20;
export const OBSERVATION_CACHE_SIZE = PROGRESSIVE_BATCH_SIZE * 2;

export function calculateExpectedFrames(
  chartTimeframe: string,
  tradeDuration: string,
  frequencySecs: number,
): number {
  if (!Number.isFinite(frequencySecs) || frequencySecs <= 0) return 0;

  const tfSeconds = parseDurationToSeconds(chartTimeframe);
  const durationSeconds = parseDurationToSeconds(tradeDuration);
  const targetSeconds = Math.max(tfSeconds, durationSeconds);

  return Math.ceil(targetSeconds / frequencySecs);
}

/**
 * The browser keeps two progressive batches in memory at most.
 * Older frames are evicted after their progressive analysis has been saved.
 * This keeps base64 image memory bounded while allowing the next 20-frame
 * batch to be collected and analyzed continuously.
 */
export function calculateMaxObservationFrames(): number {
  return OBSERVATION_CACHE_SIZE;
}
