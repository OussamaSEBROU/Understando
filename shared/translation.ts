export const TRANSLATION_LANGUAGES = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "pt", label: "Português", dir: "ltr" },
  { code: "tr", label: "Türkçe", dir: "ltr" },
  { code: "id", label: "Bahasa Indonesia", dir: "ltr" },
  { code: "ja", label: "日本語", dir: "ltr" },
  { code: "ko", label: "한국어", dir: "ltr" },
] as const;

export type TargetLanguageCode = (typeof TRANSLATION_LANGUAGES)[number]["code"];

export type SubtitleCue = {
  id: number;
  startMs: number;
  endMs: number;
  source: string;
  translated: string;
};

/** Maximum timeline window accepted for a single full-video translation request. */
export const MAX_VIDEO_DURATION_SECONDS = 28_800;

/** Default chunk window in seconds for progressive translation. */
export const CHUNK_DURATION_SECONDS = 120;

/** Overlap in seconds between adjacent translation windows for speech continuity. */
export const CHUNK_OVERLAP_SECONDS = 5;

/** Maximum number of progressive chunks to prefetch ahead of playback. */
export const CHUNK_PREFETCH_AHEAD = 2;

export type TranslationSegment = {
  videoId: string;
  targetLanguage: TargetLanguageCode;
  targetLanguageLabel: string;
  startSec: number;
  endSec: number;
  cues: SubtitleCue[];
  cached: boolean;
};

export const targetLanguageByCode = (code: TargetLanguageCode) => {
  const language = TRANSLATION_LANGUAGES.find(item => item.code === code);
  if (!language) {
    throw new Error(`Unsupported target language: ${code}`);
  }
  return language;
};
