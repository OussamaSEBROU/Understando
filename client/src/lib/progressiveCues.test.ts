import { describe, expect, it } from "vitest";
import { mergeProgressiveCues } from "./progressiveCues";

describe("mergeProgressiveCues", () => {
  it("orders incremental subtitle batches and removes exact boundary duplicates", () => {
    expect(
      mergeProgressiveCues(
        [{ id: 4, startMs: 0, endMs: 900, source: "", translated: "First" }],
        [
          { id: 1, startMs: 0, endMs: 900, source: "", translated: "First" },
          { id: 2, startMs: 1_000, endMs: 1_900, source: "", translated: "Second" },
        ]
      )
    ).toEqual([
      { id: 0, startMs: 0, endMs: 900, source: "", translated: "First" },
      { id: 1, startMs: 1_000, endMs: 1_900, source: "", translated: "Second" },
    ]);
  });

  it("preserves both adjacent batches at the exact 30-second boundary", () => {
    expect(
      mergeProgressiveCues(
        [{ id: 0, startMs: 29_100, endMs: 30_000, source: "", translated: "Before boundary" }],
        [{ id: 0, startMs: 30_000, endMs: 30_900, source: "", translated: "After boundary" }]
      )
    ).toEqual([
      { id: 0, startMs: 29_100, endMs: 30_000, source: "", translated: "Before boundary" },
      { id: 1, startMs: 30_000, endMs: 30_900, source: "", translated: "After boundary" },
    ]);
  });
});
