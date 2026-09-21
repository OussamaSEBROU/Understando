import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { mergeProgressiveCues } from "@/lib/progressiveCues";
import {
  CHUNK_DURATION_SECONDS,
  CHUNK_OVERLAP_SECONDS,
  CHUNK_PREFETCH_AHEAD,
  type SubtitleCue,
  type TargetLanguageCode,
} from "../../../shared/translation";

export type ChunkWindow = {
  startSec: number;
  endSec: number;
};

export type ProgressiveTranslationState = {
  cues: SubtitleCue[];
  videoId: string | null;
  isPreparing: boolean;
  isPreparingNext: boolean;
  error: { message: string; code?: string } | null;
  translatedUpToSec: number;
  start: (url: string, language: TargetLanguageCode, onFirstSuccess?: (videoId: string) => void) => void;
  updateDuration: (durationSec: number) => void;
  cancel: () => void;
};

/**
 * Calculates chunk windows for progressive translation.
 * Each window is CHUNK_DURATION_SECONDS long with CHUNK_OVERLAP_SECONDS overlap.
 */
export function calculateChunkWindows(durationSec: number): ChunkWindow[] {
  const windows: ChunkWindow[] = [];
  const chunkLen = CHUNK_DURATION_SECONDS;
  const step = chunkLen - CHUNK_OVERLAP_SECONDS;

  if (durationSec <= 0) return windows;

  for (let start = 0; start < durationSec; start += step) {
    const end = Math.min(start + chunkLen, Math.ceil(durationSec));
    windows.push({ startSec: start, endSec: end });
    if (end >= durationSec) break;
  }
  return windows;
}

/**
 * Manages progressive chunked translation of a YouTube video.
 *
 * - Splits the video timeline into bounded translation windows.
 * - Fetches the first playable window immediately for fast start.
 * - Continues preparing subsequent windows progressively as duration becomes known.
 * - Merges, deduplicates, and sorts cues on the absolute timeline.
 * - Cancels in-flight work when URL/language changes.
 * - Preserves partial progress if a later chunk fails.
 */
export function useProgressiveTranslation(): ProgressiveTranslationState {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isPreparingNext, setIsPreparingNext] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [translatedUpToSec, setTranslatedUpToSec] = useState(0);

  const sessionRef = useRef(0);
  const completedChunksRef = useRef(new Set<string>());
  const pendingChunksRef = useRef(new Set<string>());
  const activeParamsRef = useRef<{ url: string; language: TargetLanguageCode } | null>(null);
  const windowsRef = useRef<ChunkWindow[]>([]);
  const nextWindowIndexRef = useRef(0);
  const highestEndSecRef = useRef(0);

  const translateSegment = trpc.video.translateSegment.useMutation();

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    completedChunksRef.current = new Set();
    pendingChunksRef.current = new Set();
    activeParamsRef.current = null;
    windowsRef.current = [];
    nextWindowIndexRef.current = 0;
    highestEndSecRef.current = 0;
    setIsPreparing(false);
    setIsPreparingNext(false);
  }, []);

  const chunkKey = (w: ChunkWindow) => `${w.startSec}:${w.endSec}`;

  const scheduleNext = useCallback(
    (session: number) => {
      if (sessionRef.current !== session || !activeParamsRef.current) return;
      const { url, language } = activeParamsRef.current;
      const windows = windowsRef.current;

      const pendingCount = pendingChunksRef.current.size;
      const available = CHUNK_PREFETCH_AHEAD - pendingCount;

      for (let i = 0; i < available && nextWindowIndexRef.current < windows.length; i++) {
        const window = windows[nextWindowIndexRef.current];
        nextWindowIndexRef.current++;
        const key = chunkKey(window);
        if (completedChunksRef.current.has(key) || pendingChunksRef.current.has(key)) continue;

        pendingChunksRef.current.add(key);
        void translateSegment
          .mutateAsync({
            youtubeUrl: url,
            targetLanguage: language,
            startSec: window.startSec,
            endSec: window.endSec,
          })
          .then(result => {
            if (sessionRef.current !== session) return;
            completedChunksRef.current.add(key);
            pendingChunksRef.current.delete(key);

            if (window.endSec > highestEndSecRef.current) {
              highestEndSecRef.current = window.endSec;
              setTranslatedUpToSec(highestEndSecRef.current);
            }

            setCues(prev => mergeProgressiveCues(prev, result.cues));
            scheduleNext(session);
          })
          .catch(err => {
            if (sessionRef.current !== session) return;
            pendingChunksRef.current.delete(key);
            const code = (err as { data?: { code?: string } })?.data?.code;
            if (code === "TOO_MANY_REQUESTS") {
              setIsPreparingNext(false);
            }
          });
      }

      const allDone = completedChunksRef.current.size >= windows.length && nextWindowIndexRef.current >= windows.length;
      const anyPending = pendingChunksRef.current.size > 0;
      setIsPreparingNext(!allDone && (anyPending || nextWindowIndexRef.current < windows.length));
    },
    [translateSegment]
  );

  const start = useCallback(
    (url: string, language: TargetLanguageCode, onFirstSuccess?: (videoId: string) => void) => {
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      completedChunksRef.current = new Set();
      pendingChunksRef.current = new Set();
      activeParamsRef.current = { url, language };
      windowsRef.current = [{ startSec: 0, endSec: CHUNK_DURATION_SECONDS }];
      nextWindowIndexRef.current = 1;
      highestEndSecRef.current = 0;

      setCues([]);
      setVideoId(null);
      setError(null);
      setIsPreparing(true);
      setIsPreparingNext(false);
      setTranslatedUpToSec(0);

      const firstWindow = windowsRef.current[0];
      const key = chunkKey(firstWindow);
      pendingChunksRef.current.add(key);

      translateSegment
        .mutateAsync({
          youtubeUrl: url,
          targetLanguage: language,
          startSec: firstWindow.startSec,
          endSec: firstWindow.endSec,
        })
        .then(result => {
          if (sessionRef.current !== session) return;
          completedChunksRef.current.add(key);
          pendingChunksRef.current.delete(key);

          setVideoId(result.videoId);
          setIsPreparing(false);
          highestEndSecRef.current = firstWindow.endSec;
          setTranslatedUpToSec(firstWindow.endSec);
          setCues(result.cues);

          onFirstSuccess?.(result.videoId);
          scheduleNext(session);
        })
        .catch(err => {
          if (sessionRef.current !== session) return;
          pendingChunksRef.current.delete(key);
          setIsPreparing(false);
          const msg = err instanceof Error ? err.message : "Translation failed";
          const code = (err as { data?: { code?: string } })?.data?.code;
          setError({ message: msg, code });
        });
    },
    [scheduleNext, translateSegment]
  );

  const updateDuration = useCallback(
    (durationSec: number) => {
      if (durationSec <= 0 || !activeParamsRef.current) return;
      const session = sessionRef.current;

      const fullWindows = calculateChunkWindows(durationSec);
      if (fullWindows.length <= windowsRef.current.length) return;

      windowsRef.current = fullWindows;
      scheduleNext(session);
    },
    [scheduleNext]
  );

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
    };
  }, []);

  return {
    cues,
    videoId,
    isPreparing,
    isPreparingNext,
    error,
    translatedUpToSec,
    start,
    updateDuration,
    cancel,
  };
}
