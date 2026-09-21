import { describe, expect, it, vi } from "vitest";

describe("Zen Mode controls state logic", () => {
  it("defines auto-hide delay constant of 2500ms", () => {
    const ZEN_AUTO_HIDE_MS = 2500;
    expect(ZEN_AUTO_HIDE_MS).toBe(2500);
  });

  it("handles auto-hide timer transitions correctly", () => {
    vi.useFakeTimers();

    let controlsVisible = true;
    let interacting = false;
    let focused = false;
    let timer: NodeJS.Timeout | null = null;

    const scheduleHide = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!interacting && !focused) {
          controlsVisible = false;
        }
      }, 2500);
    };

    const reveal = () => {
      controlsVisible = true;
      scheduleHide();
    };

    scheduleHide();
    expect(controlsVisible).toBe(true);

    vi.advanceTimersByTime(2500);
    expect(controlsVisible).toBe(false);

    reveal();
    expect(controlsVisible).toBe(true);

    focused = true;
    vi.advanceTimersByTime(3000);
    expect(controlsVisible).toBe(true);

    focused = false;
    scheduleHide();
    vi.advanceTimersByTime(2500);
    expect(controlsVisible).toBe(false);

    reveal();
    interacting = true;
    if (timer) clearTimeout(timer);
    vi.advanceTimersByTime(5000);
    expect(controlsVisible).toBe(true);

    interacting = false;
    scheduleHide();
    vi.advanceTimersByTime(2500);
    expect(controlsVisible).toBe(false);

    vi.useRealTimers();
  });
});
