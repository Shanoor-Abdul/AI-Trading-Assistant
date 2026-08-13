export const PROGRESSIVE_BATCH_SIZE = 20;

export function getBatchProgress(
  totalFramesCaptured: number,
  lastAnalyzedObservationIndex: number,
  observationCount: number,
): number {
  if (observationCount === 0) return 0;

  const analyzedThrough = lastAnalyzedObservationIndex >= 0
    ? lastAnalyzedObservationIndex + 1
    : 0;

  return Math.max(0, Math.min(
    PROGRESSIVE_BATCH_SIZE,
    totalFramesCaptured - Math.max(0, totalFramesCaptured - observationCount) - analyzedThrough,
  ));
}

export function hasCompleteBatch(
  observationsAvailableForBatch: number,
  batchSize = PROGRESSIVE_BATCH_SIZE,
): boolean {
  return observationsAvailableForBatch >= batchSize;
}
