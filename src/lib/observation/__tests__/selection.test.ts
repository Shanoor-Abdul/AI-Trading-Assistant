import { describe, expect, it } from "vitest";
import { selectObservationFrames } from "../selection";
import type { Observation } from "@/lib/types";

function observations(count: number): Observation[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: index + 1,
    imageBase64: `frame-${index + 1}`,
  }));
}

describe("selectObservationFrames", () => {
  it("returns all frames when below the provider limit", () => {
    expect(selectObservationFrames(observations(5), 10)).toHaveLength(5);
  });

  it("never exceeds the requested limit", () => {
    expect(selectObservationFrames(observations(40), 10)).toHaveLength(10);
  });

  it("always includes the newest frame", () => {
    const result = selectObservationFrames(observations(40), 10);
    expect(result.at(-1)?.timestamp).toBe(40);
  });

  it("preserves chronological order", () => {
    const result = selectObservationFrames(observations(40), 8);
    expect(result.map((item) => item.timestamp)).toEqual(
      [...result].sort((a, b) => a.timestamp - b.timestamp).map((item) => item.timestamp),
    );
  });
});
