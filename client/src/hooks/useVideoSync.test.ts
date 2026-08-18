import { describe, expect, it } from "vitest";
import { findActiveCue } from "./useVideoSync";

const cues = [
  { startMs: 1_360, endMs: 2_400, source: "one", translated: "واحد" },
  { startMs: 2_400, endMs: 3_100, source: "two", translated: "اثنان" },
];

describe("findActiveCue", () => {
  it("selects the timed caption using millisecond timestamps", () => {
    expect(findActiveCue(cues, 1_360)?.translated).toBe("واحد");
    expect(findActiveCue(cues, 2_400)?.translated).toBe("اثنان");
  });

  it("returns no caption outside timed ranges", () => {
    expect(findActiveCue(cues, 1_359)).toBeNull();
    expect(findActiveCue(cues, 3_100)).toBeNull();
  });
});

