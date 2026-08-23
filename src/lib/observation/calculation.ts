import { parseDurationToSeconds } from "./timeframe";

export const PROGRESSIVE_BATCH_SIZE = 5;
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

export function calculateMaxObservationFrames(
  chartTimeframe: string,
  tradeDuration: string,
  frequencySecs: number
): number {
  const expected = calculateExpectedFrames(chartTimeframe, tradeDuration, frequencySecs);
  return Math.max(10, expected * 2);
}
