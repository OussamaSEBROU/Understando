import { useEffect, useState, type RefObject } from "react";
import type { SubtitleCue } from "../../../shared/translation";

type PlayerTimeSource = {
  getCurrentTime: () => number;
};

export const findActiveCue = (cues: SubtitleCue[], timeMs: number) => {
  let left = 0;
  let right = cues.length - 1;

  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const cue = cues[middle];
    if (timeMs < cue.startMs) right = middle - 1;
    else if (timeMs >= cue.endMs) left = middle + 1;
    else return cue;
  }
  return null;
};

/** Synchronizes the subtitle overlay to the official player clock every frame. */
export function useVideoSync(
  playerRef: RefObject<PlayerTimeSource | null>,
  cues: SubtitleCue[]
) {
  const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null);

  useEffect(() => {
    if (cues.length === 0) {
      setActiveCue(null);
      return;
    }

    let frame = 0;
    let lastCueId: number | null = null;
    const tick = () => {
      const seconds = playerRef.current?.getCurrentTime();
      if (typeof seconds === "number" && Number.isFinite(seconds)) {
        const cue = findActiveCue(cues, Math.round(seconds * 1_000));
        if (cue?.id !== lastCueId) {
          lastCueId = cue?.id ?? null;
          setActiveCue(cue);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [cues, playerRef]);

  return activeCue;
}
