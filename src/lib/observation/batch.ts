import { PROGRESSIVE_BATCH_SIZE } from "./calculation";

export { PROGRESSIVE_BATCH_SIZE };

export function getUnanalyzedBatchCount(
  observationCount: number,
  lastAnalyzedObservationIndex: number,
): number {
  if (observationCount <= 0) return 0;

  const analyzedCount = lastAnalyzedObservationIndex >= 0
    ? lastAnalyzedObservationIndex + 1
    : 0;

  return Math.max(0, observationCount - analyzedCount);
}

export function hasCompleteBatch(
  observationCount: number,
  lastAnalyzedObservationIndex: number,
): boolean {
  return getUnanalyzedBatchCount(observationCount, lastAnalyzedObservationIndex) >= PROGRESSIVE_BATCH_SIZE;
}
