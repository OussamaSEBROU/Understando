import type { SubtitleCue } from "../../../shared/translation";

export const mergeProgressiveCues = (existing: SubtitleCue[], incoming: SubtitleCue[]) => {
  const unique = new Map<string, SubtitleCue>();
  for (const cue of [...existing, ...incoming]) {
    unique.set(`${cue.startMs}:${cue.endMs}:${cue.translated}`, cue);
  }

  return Array.from(unique.values())
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
    .map((cue, id) => ({ ...cue, id }));
};
