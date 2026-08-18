import { describe, expect, it } from "vitest";
import { getSeekTarget } from "./playerControls";

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
