export interface VisualChangeOptions {
  pixelStride?: number;
  channelThreshold?: number;
  changedRatioThreshold?: number;
  meanDifferenceThreshold?: number;
}

export function visualChangeScore(
  previous: ImageData | null,
  current: ImageData,
  options: VisualChangeOptions = {},
): number {
  if (!previous || previous.width !== current.width || previous.height !== current.height) {
    return 1;
  }

  const pixelStride = Math.max(4, options.pixelStride ?? 16);
  const channelThreshold = options.channelThreshold ?? 18;
  const dataA = previous.data;
  const dataB = current.data;

  let changed = 0;
  let samples = 0;
  let totalDifference = 0;

  for (let y = 0; y < current.height; y += pixelStride) {
    for (let x = 0; x < current.width; x += pixelStride) {
      const i = (y * current.width + x) * 4;
      const diff =
        Math.abs(dataA[i] - dataB[i]) +
        Math.abs(dataA[i + 1] - dataB[i + 1]) +
        Math.abs(dataA[i + 2] - dataB[i + 2]);

      samples += 1;
      totalDifference += diff / 765;
      if (diff >= channelThreshold * 3) changed += 1;
    }
  }

  if (samples === 0) return 0;

  const changedRatio = changed / samples;
  const meanDifference = totalDifference / samples;
  const ratioThreshold = options.changedRatioThreshold ?? 0.012;
  const meanThreshold = options.meanDifferenceThreshold ?? 0.008;

  if (changedRatio >= ratioThreshold || meanDifference >= meanThreshold) {
    return Math.max(changedRatio, meanDifference);
  }

  return Math.max(changedRatio, meanDifference);
}

export function hasSignificantVisualChange(
  previous: ImageData | null,
  current: ImageData,
  options: VisualChangeOptions = {},
): boolean {
  if (!previous) return true;

  const score = visualChangeScore(previous, current, options);
  return score >= Math.min(
    options.changedRatioThreshold ?? 0.012,
    options.meanDifferenceThreshold ?? 0.008,
  );
}
