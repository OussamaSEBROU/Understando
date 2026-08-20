import {
  TRANSLATION_LANGUAGES,
  type SubtitleCue,
  type TargetLanguageCode,
  targetLanguageByCode,
} from "../shared/translation";
import { FreeQuotaGovernor } from "./quotaGovernor";

type SourceCue = Omit<SubtitleCue, "translated">;

type CacheValue = {
  expiresAt: number;
  result: TranslationResult;
};

type InteractionResponse = {
  output_text?: unknown;
  steps?: unknown;
  usage?: {
    total_input_tokens?: unknown;
    total_output_tokens?: unknown;
  };
};

export type TranslationResult = {
  videoId: string;
  targetLanguage: TargetLanguageCode;
  targetLanguageLabel: string;
  cues: SubtitleCue[];
  cached: boolean;
};

export class VideoTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoTranslationError";
  }
}

const translationCache = new Map<string, CacheValue>();
const inFlightTranslations = new Map<string, Promise<TranslationResult>>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CUES_PER_BLOCK = 34;
const MAX_BLOCK_CHARS = 7_000;
const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const positiveInteger = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Video is substantially more token-intensive than plain subtitle text. These
 * conservative defaults serialize direct-video analysis and reserve capacity
 * before a provider call. Operators can lower them further in Render without
 * publishing a new build.
 */
const videoQuotaGovernor = new FreeQuotaGovernor({
  rpm: positiveInteger("FREE_VIDEO_RPM", 1),
  tpm: positiveInteger("FREE_VIDEO_TPM", 120_000),
  rpd: positiveInteger("FREE_VIDEO_RPD", 12),
  tpd: positiveInteger("FREE_VIDEO_TPD", 720_000),
});

const MAX_VIDEO_INPUT_TOKENS = positiveInteger("FREE_VIDEO_MAX_INPUT_TOKENS", 100_000);
const MAX_VIDEO_OUTPUT_TOKENS = positiveInteger("FREE_VIDEO_MAX_OUTPUT_TOKENS", 6_144);
const FALLBACK_VIDEO_RESERVATION_TOKENS = positiveInteger("FREE_VIDEO_FALLBACK_TOKENS", 60_000);

export const extractYoutubeVideoId = (value: string): string => {
  const candidate = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;

  let url: URL;
  try {
    url = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
  } catch {
    throw new VideoTranslationError("Enter a valid YouTube video link.");
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v");
    else if (/^\/(embed|shorts|live)\//.test(url.pathname)) {
      videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
    }
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new VideoTranslationError("The link does not contain a usable YouTube video ID.");
  }
  return videoId;
};

const canonicalYoutubeUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

const cleanText = (text: string) =>
  text.replace(/\s+/g, " ").replace(/\[\s*music\s*\]/gi, "").trim();

/** Retained as a pure utility for the existing timestamp contract tests. */
export const sourceCueFromTranscript = (
  cue: { offset: number; duration: number; text: string },
  id: number
): SourceCue => ({
  id,
  startMs: Math.max(0, Math.round(cue.offset)),
  endMs: Math.max(0, Math.round(cue.offset + cue.duration)),
  source: cleanText(cue.text),
});

/** Retained as a pure utility for the existing subtitle contract tests. */
export const chunkCues = (cues: SourceCue[]): SourceCue[][] => {
  const blocks: SourceCue[][] = [];
  let current: SourceCue[] = [];
  let characters = 0;

  for (const cue of cues) {
    const exceedsCueLimit = current.length >= MAX_CUES_PER_BLOCK;
    const exceedsCharacterLimit = current.length > 0 && characters + cue.source.length > MAX_BLOCK_CHARS;
    if (exceedsCueLimit || exceedsCharacterLimit) {
      blocks.push(current);
      current = [];
      characters = 0;
    }
    current.push(cue);
    characters += cue.source.length;
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
};

const extractJson = (value: string, depth = 0): unknown => {
  if (depth > 2) {
    throw new VideoTranslationError("The translation response was nested too deeply.");
  }

  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidates = [trimmed];
  if (start >= 0 && end >= start && trimmed.slice(start, end + 1) !== trimmed) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return typeof parsed === "string" ? extractJson(parsed, depth + 1) : parsed;
    } catch {
      // Try the next safe JSON candidate. Model output is never logged.
    }
  }

  throw new VideoTranslationError("The translation response could not be parsed.");
};

/** Retained for the established source-caption mapping tests. */
export const parseTranslatedBlock = (raw: string, source: SourceCue[]): SubtitleCue[] => {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { translations?: unknown }).translations)) {
    throw new VideoTranslationError("The translation response did not include the required caption list.");
  }

  const translatedById = new Map<number, string>();
  for (const item of (parsed as { translations: unknown[] }).translations) {
    if (!item || typeof item !== "object") continue;
    const { id, text } = item as { id?: unknown; text?: unknown };
    if (typeof id === "number" && typeof text === "string" && text.trim()) {
      translatedById.set(id, cleanText(text));
    }
  }

  if (translatedById.size !== source.length || source.some(cue => !translatedById.has(cue.id))) {
    throw new VideoTranslationError("The translation response did not preserve the caption mapping.");
  }

  return source.map(cue => ({ ...cue, translated: translatedById.get(cue.id) ?? "" }));
};

export const llmContentToText = (content: unknown): string | null => {
  if (typeof content === "string" && content.trim()) return content;
  if (!Array.isArray(content)) return null;

  const text = content
    .flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const value = (item as { type?: unknown; text?: unknown }).text;
      return typeof value === "string" ? [value] : [];
    })
    .join("\n")
    .trim();

  return text || null;
};

const interactionText = (payload: InteractionResponse): string | null => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  if (!Array.isArray(payload.steps)) return null;

  const content = payload.steps.flatMap(step => {
    if (!step || typeof step !== "object") return [];
    const value = (step as { content?: unknown }).content;
    return Array.isArray(value) ? value : [];
  });
  return llmContentToText(content);
};

const videoTranslationSchema = {
  type: "object",
  properties: {
    cues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startMs: { type: "integer", minimum: 0 },
          endMs: { type: "integer", minimum: 1 },
          text: { type: "string" },
        },
        required: ["startMs", "endMs", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["cues"],
  additionalProperties: false,
} as const;

const directVideoPrompt = (language: ReturnType<typeof targetLanguageByCode>) =>
  [
    "Create timed, subtitle-quality translations for this public video.",
    `Target language: ${language.label}.`,
    "Return only the translated spoken content as caption cues in the required JSON schema.",
    "Translate idiomatically from the complete audio-visual context. Preserve names, pronunciations, technical terms, and established spellings when appropriate.",
    "Never summarize, explain, comment, invent content, or add a transcript separate from the translated captions.",
    "Use integer startMs and endMs values in milliseconds from the video timeline. Keep each cue concise, naturally readable, and aligned to the spoken phrase. Do not emit cues for silence.",
  ].join("\n");

const modelName = () => process.env.VIDEO_TRANSLATION_MODEL?.trim() || DEFAULT_MODEL;

const countVideoInputTokens = async (apiKey: string, videoUrl: string, prompt: string): Promise<number | null> => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName())}:countTokens`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { file_data: { file_uri: videoUrl, mime_type: "video/*" } },
              ],
            },
          ],
        }),
      }
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as { totalTokens?: unknown; total_tokens?: unknown };
    const total = typeof payload.totalTokens === "number" ? payload.totalTokens : payload.total_tokens;
    return typeof total === "number" && Number.isFinite(total) && total > 0 ? Math.ceil(total) : null;
  } catch {
    return null;
  }
};

export const parseDirectVideoCues = (raw: string): SubtitleCue[] => {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { cues?: unknown }).cues)) {
    throw new VideoTranslationError("The video translation response did not include timed captions.");
  }

  const cues = (parsed as { cues: unknown[] }).cues.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const { startMs, endMs, text } = item as { startMs?: unknown; endMs?: unknown; text?: unknown };
    if (
      typeof startMs !== "number" ||
      typeof endMs !== "number" ||
      typeof text !== "string" ||
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs)
    ) {
      return [];
    }

    const translated = cleanText(text);
    const normalizedStart = Math.max(0, Math.round(startMs));
    const normalizedEnd = Math.max(normalizedStart + 250, Math.round(endMs));
    return translated
      ? [
          {
            id: index,
            startMs: normalizedStart,
            endMs: normalizedEnd,
            source: "",
            translated,
          },
        ]
      : [];
  });

  if (cues.length === 0) {
    throw new VideoTranslationError("The video did not produce usable timed translations.");
  }

  return cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs).map((cue, id) => ({ ...cue, id }));
};

const providerError = (status: number) => {
  if (status === 429) {
    return new VideoTranslationError("The free translation queue is busy. Your request was held back to protect the daily limit; please retry shortly.");
  }
  if (status === 401 || status === 403) {
    return new VideoTranslationError("The translation service is not configured correctly. Check the server environment variable and redeploy.");
  }
  if (status >= 500) {
    return new VideoTranslationError("The translation service is temporarily unavailable. Please retry in a moment.");
  }
  return new VideoTranslationError("This public video could not be processed for timed translation.");
};

const requestDirectVideoTranslation = async (
  apiKey: string,
  videoUrl: string,
  prompt: string
): Promise<SubtitleCue[]> => {
  const response = await fetch(INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: modelName(),
      input: [
        { type: "text", text: prompt },
        { type: "video", uri: videoUrl },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: videoTranslationSchema,
      },
      generation_config: {
        temperature: 0.1,
        max_output_tokens: MAX_VIDEO_OUTPUT_TOKENS,
      },
    }),
  });

  if (!response.ok) throw providerError(response.status);

  const payload = (await response.json()) as InteractionResponse;
  const output = interactionText(payload);
  if (!output) {
    throw new VideoTranslationError("The video translation service returned no timed captions.");
  }
  return parseDirectVideoCues(output);
};

export const translateVideo = async ({
  youtubeUrl,
  targetLanguage,
}: {
  youtubeUrl: string;
  targetLanguage: TargetLanguageCode;
}): Promise<TranslationResult> => {
  const videoId = extractYoutubeVideoId(youtubeUrl);
  const language = targetLanguageByCode(targetLanguage);
  const cacheKey = `${videoId}:${targetLanguage}`;
  const cached = translationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cached: true };
  }

  const existing = inFlightTranslations.get(cacheKey);
  if (existing) return existing;

  const job = (async () => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new VideoTranslationError("The translation service is not configured. Add the server key in Render Environment and redeploy.");
    }

    const videoUrl = canonicalYoutubeUrl(videoId);
    const prompt = directVideoPrompt(language);
    const countedInputTokens = await countVideoInputTokens(apiKey, videoUrl, prompt);
    const inputTokens = countedInputTokens ?? FALLBACK_VIDEO_RESERVATION_TOKENS;

    if (inputTokens > MAX_VIDEO_INPUT_TOKENS) {
      throw new VideoTranslationError("This video is longer than the current free processing limit. Try a shorter public video or raise the server limit only if your free quota allows it.");
    }

    // Reserve input plus the maximum structured subtitle output before the call.
    await videoQuotaGovernor.reserve(inputTokens + MAX_VIDEO_OUTPUT_TOKENS);
    const cues = await requestDirectVideoTranslation(apiKey, videoUrl, prompt);

    const result: TranslationResult = {
      videoId,
      targetLanguage,
      targetLanguageLabel: language.label,
      cues,
      cached: false,
    };
    translationCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    return result;
  })();

  inFlightTranslations.set(cacheKey, job);
  try {
    return await job;
  } finally {
    inFlightTranslations.delete(cacheKey);
  }
};

export const supportedTargetLanguageCodes = TRANSLATION_LANGUAGES.map(item => item.code);
