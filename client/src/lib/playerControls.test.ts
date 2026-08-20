import { describe, expect, it } from "vitest";
import { clampPlaybackTime, getDoubleTapSeekOffset, getSeekTarget } from "./playerControls";

describe("getSeekTarget", () => {
  it("moves the official player time by the requested offset", () => {
    expect(getSeekTarget(42, 214, 10)).toBe(52);
    expect(getSeekTarget(42, 214, -10)).toBe(32);
  });

  it("keeps seeks inside the playable video range", () => {
    expect(getSeekTarget(3, 214, -10)).toBe(0);
    expect(getSeekTarget(210, 214, 10)).toBe(214);
  });
});

describe("getDoubleTapSeekOffset", () => {
  it("maps the left and right gesture zones to ten-second seeks", () => {
    expect(getDoubleTapSeekOffset("back")).toBe(-10);
    expect(getDoubleTapSeekOffset("forward")).toBe(10);
  });
});

describe("clampPlaybackTime", () => {
  it("keeps a direct timeline target inside the playable range", () => {
    expect(clampPlaybackTime(-2, 100)).toBe(0);
    expect(clampPlaybackTime(44.5, 100)).toBe(44.5);
    expect(clampPlaybackTime(120, 100)).toBe(100);
  });
});
