import { describe, expect, it } from "vitest";
import { calculateExpectedFrames, calculateMaxObservationFrames, PROGRESSIVE_BATCH_SIZE } from "../calculation";
import { parseDurationToSeconds } from "../timeframe";

describe("observation timing", () => {
  it("parses common chart durations", () => {
    expect(parseDurationToSeconds("5m")).toBe(300);
    expect(parseDurationToSeconds("15m")).toBe(900);
    expect(parseDurationToSeconds("1h")).toBe(3600);
  });

  it("calculates 5m/5m observation frames", () => {
    expect(calculateExpectedFrames("5m", "5m", 15)).toBe(20);
    expect(calculateExpectedFrames("5m", "5m", 30)).toBe(10);
    expect(calculateExpectedFrames("5m", "5m", 60)).toBe(5);
  });

  it("calculates 15m/15m observation frames", () => {
    expect(calculateExpectedFrames("15m", "15m", 15)).toBe(60);
    expect(calculateExpectedFrames("15m", "15m", 30)).toBe(30);
    expect(calculateExpectedFrames("15m", "15m", 60)).toBe(15);
  });

  it("rejects invalid frequency values safely", () => {
    expect(calculateExpectedFrames("5m", "5m", 0)).toBe(0);
    expect(calculateExpectedFrames("5m", "5m", -15)).toBe(0);
    expect(calculateExpectedFrames("5m", "5m", Number.NaN)).toBe(0);
  });

  it("keeps enough frames for one completed and one active batch", () => {
    expect(PROGRESSIVE_BATCH_SIZE).toBe(20);
    expect(calculateMaxObservationFrames()).toBe(40);
  });
});
