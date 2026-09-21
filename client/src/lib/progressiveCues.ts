import type { SubtitleCue } from "../../../shared/translation";

export const mergeProgressiveCues = (existing: SubtitleCue[], incoming: SubtitleCue[]): SubtitleCue[] => {
  const combined = [...existing, ...incoming];
  if (combined.length === 0) return [];

  // Step 1: Initial sort by start time, then end time
  const sorted = combined
    .filter(cue => cue && typeof cue.startMs === "number" && typeof cue.endMs === "number" && cue.translated?.trim())
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  // Step 2: Deduplicate
  const result: SubtitleCue[] = [];

  for (const cue of sorted) {
    const trimmedText = cue.translated.trim();
    const last = result[result.length - 1];

    if (last) {
      // Exact timestamp and text duplicate
      if (last.startMs === cue.startMs && last.endMs === cue.endMs && last.translated.trim() === trimmedText) {
        continue;
      }

      // Boundary overlap deduplication (same text within boundary tolerance)
      const overlapStart = Math.max(last.startMs, cue.startMs);
      const overlapEnd = Math.min(last.endMs, cue.endMs);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      const isOverlapping = overlapMs > 0 || Math.abs(cue.startMs - last.startMs) <= 3000;

      if (isOverlapping && last.translated.trim() === trimmedText) {
        last.startMs = Math.min(last.startMs, cue.startMs);
        last.endMs = Math.max(last.endMs, cue.endMs);
        continue;
      }
    }

    result.push({
      ...cue,
      translated: trimmedText,
    });
  }

  // Final sort and sequential ID assignment
  return result
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
    .map((cue, id) => ({ ...cue, id }));
};
