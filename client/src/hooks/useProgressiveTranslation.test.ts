import { describe, expect, it } from "vitest";
import { calculateChunkWindows } from "./useProgressiveTranslation";
import { CHUNK_DURATION_SECONDS, CHUNK_OVERLAP_SECONDS } from "../../../shared/translation";

describe("calculateChunkWindows", () => {
  it("calculates sequential bounded chunk windows with proper overlap", () => {
    const duration = 300; // 5 minutes
    const windows = calculateChunkWindows(duration);

    expect(windows.length).toBeGreaterThan(1);
    expect(windows[0]).toEqual({ startSec: 0, endSec: CHUNK_DURATION_SECONDS });

    const step = CHUNK_DURATION_SECONDS - CHUNK_OVERLAP_SECONDS;
    expect(windows[1].startSec).toBe(step);
    expect(windows[1].endSec).toBe(Math.min(step + CHUNK_DURATION_SECONDS, duration));

    const lastWindow = windows[windows.length - 1];
    expect(lastWindow.endSec).toBe(duration);
  });

  it("handles short videos shorter than a single chunk window", () => {
    const windows = calculateChunkWindows(45);
    expect(windows).toEqual([{ startSec: 0, endSec: 45 }]);
  });

  it("returns empty array for zero or negative duration", () => {
    expect(calculateChunkWindows(0)).toEqual([]);
    expect(calculateChunkWindows(-10)).toEqual([]);
  });

  it("does not exceed video duration in the final window", () => {
    const duration = 125;
    const windows = calculateChunkWindows(duration);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toEqual({ startSec: 0, endSec: 120 });
    expect(windows[1].endSec).toBe(125);
  });
});
