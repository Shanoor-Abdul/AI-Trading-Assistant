import { parseDurationToSeconds } from "./timeframe";

export function calculateExpectedFrames(chartTimeframe: string, tradeDuration: string, frequencySecs: number): number {
  const tfSeconds = parseDurationToSeconds(chartTimeframe);
  const durationSeconds = parseDurationToSeconds(tradeDuration);
  
  const targetSeconds = Math.max(tfSeconds, durationSeconds);
  return Math.ceil(targetSeconds / frequencySecs);
}

export function calculateMaxObservationFrames(): number {
  // We need at most the current batch size + whatever is accumulated
  // To be safe and prevent memory leak, max is 40. The 20-frame batch will pull from this.
  return 40;
}
