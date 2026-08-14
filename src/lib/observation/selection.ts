import type { Observation } from "@/lib/types";

/**
 * Select chronologically distributed observations while always retaining the newest frame.
 * The function is deterministic and does not mutate the source array.
 */
export function selectObservationFrames(observations: Observation[], maxImages: number): Observation[] {
  if (maxImages <= 0 || observations.length === 0) return [];
  if (observations.length <= maxImages) return [...observations];

  const limit = Math.min(maxImages, observations.length);
  const indexes = new Set<number>();
  indexes.add(observations.length - 1);

  for (let i = 0; indexes.size < limit; i += 1) {
    const ratio = i / Math.max(1, limit - 2);
    const index = Math.round((observations.length - 1) * ratio);
    indexes.add(Math.min(observations.length - 2, Math.max(0, index)));
  }

  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => observations[index]);
}
