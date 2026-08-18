import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import {
  TRANSLATION_LANGUAGES,
  type SubtitleCue,
  type TargetLanguageCode,
  targetLanguageByCode,
} from "../shared/translation";
import { invokeLLM } from "./_core/llm";
import {
  estimateTranslationTokens,
  freeQuotaGovernor,
  QuotaLimitError,
} from "./quotaGovernor";

type SourceCue = Omit<SubtitleCue, "translated">;

type CacheValue = {
  expiresAt: number;
  result: TranslationResult;
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

const transcriptCache = new Map<string, { expiresAt: number; cues: SourceCue[] }>();
const translationCache = new Map<string, CacheValue>();
const inFlightTranslations = new Map<string, Promise<TranslationResult>>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CUES_PER_BLOCK = 34;
const MAX_BLOCK_CHARS = 7_000;

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

const cleanText = (text: string) =>
  text.replace(/\s+/g, " ").replace(/\[\s*music\s*\]/gi, "").trim();

export const sourceCueFromTranscript = (
  cue: { offset: number; duration: number; text: string },
  id: number
): SourceCue => ({
  id,
  // youtube-transcript returns both offset and duration in milliseconds.
  startMs: Math.max(0, Math.round(cue.offset)),
  endMs: Math.max(0, Math.round(cue.offset + cue.duration)),
  source: cleanText(cue.text),
});

export const fetchSourceCues = async (videoId: string): Promise<SourceCue[]> => {
  const cached = transcriptCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.cues;

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    const cues = transcript
      .map(sourceCueFromTranscript)
      .filter(cue => cue.source.length > 0 && cue.endMs > cue.startMs);

    if (cues.length === 0) {
      throw new VideoTranslationError("No usable captions were found for this video.");
    }

    transcriptCache.set(videoId, { expiresAt: Date.now() + CACHE_TTL_MS, cues });
    return cues;
  } catch (error) {
    if (error instanceof VideoTranslationError) throw error;
    const message = error instanceof Error ? error.message : "Unknown caption error";
    throw new VideoTranslationError(
      `Captions could not be retrieved. The video may not expose a usable transcript. (${message})`
    );
  }
};

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

const translationPrompt = (
  block: SourceCue[],
  language: ReturnType<typeof targetLanguageByCode>,
  priorContext: SourceCue[],
  nextContext: SourceCue[]
) => {
  const target = block.map(cue => ({ id: cue.id, text: cue.source }));
  return [
    "You translate subtitle captions for video playback.",
    `Target language: ${language.label}.`,
    "Translate idiomatically from the local context; preserve names, technical terms, and established spellings where appropriate.",
    "Never invent content, never summarize, and never add commentary.",
    "Return strict JSON only in the exact shape: {\"translations\":[{\"id\":number,\"text\":string}]}",
    "Return every target id exactly once. Do not change IDs. Timestamps are intentionally not included and remain server-controlled.",
    priorContext.length ? `Previous context: ${JSON.stringify(priorContext.map(cue => cue.source))}` : "",
    nextContext.length ? `Following context: ${JSON.stringify(nextContext.map(cue => cue.source))}` : "",
    `Target captions: ${JSON.stringify(target)}`,
  ]
    .filter(Boolean)
    .join("\n");
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
      // Try the next safe JSON candidate; no model output is logged.
    }
  }

  throw new VideoTranslationError("The translation response could not be parsed.");
};

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

const invokeExternalFreeModel = async (prompt: string, maxOutputTokens: number) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens,
      responseMimeType: "application/json",
    },
  });
  return response.response.text();
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

const invokeEmbeddedFallback = async (prompt: string, maxOutputTokens: number) => {
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "You are a precise subtitle translator. Follow the user's JSON contract exactly." },
      { role: "user", content: prompt },
    ],
    maxTokens: maxOutputTokens,
    responseFormat: { type: "json_object" },
  });
  const content = llmContentToText(response.choices[0]?.message.content);
  if (!content) {
    throw new VideoTranslationError("The fallback translation service returned no text.");
  }
  return content;
};

const translateBlock = async (
  block: SourceCue[],
  language: ReturnType<typeof targetLanguageByCode>,
  previous: SourceCue[],
  next: SourceCue[]
) => {
  const prompt = translationPrompt(block, language, previous, next);
  const estimatedTokens = estimateTranslationTokens(prompt);
  const maxOutputTokens = Math.min(8_192, Math.max(1_024, Math.ceil(estimatedTokens * 0.72)));

  await freeQuotaGovernor.reserve(estimatedTokens + maxOutputTokens);

  let externalFailure: Error | undefined;
  try {
    const externalResponse = await invokeExternalFreeModel(prompt, maxOutputTokens);
    if (externalResponse) return parseTranslatedBlock(externalResponse, block);
  } catch (error) {
    externalFailure = error instanceof Error ? error : new Error("Unknown external translation error");
    console.warn("[Translation] External free model failed validation; using fallback.");
  }

  try {
    const fallbackResponse = await invokeEmbeddedFallback(prompt, maxOutputTokens);
    return parseTranslatedBlock(fallbackResponse, block);
  } catch (error) {
    if (error instanceof QuotaLimitError) throw error;
    const message = error instanceof Error ? error.message : "Unknown translation error";
    const suffix = externalFailure ? " Both configured translation paths were unavailable." : "";
    throw new VideoTranslationError(`Translation could not be completed. (${message})${suffix}`);
  }
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
    const source = await fetchSourceCues(videoId);
    const blocks = chunkCues(source);
    const translated: SubtitleCue[] = [];

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      const previous = source.slice(Math.max(0, block[0].id - 2), block[0].id);
      const endId = block[block.length - 1].id;
      const next = source.slice(endId + 1, endId + 3);
      translated.push(...(await translateBlock(block, language, previous, next)));
    }

    const result: TranslationResult = {
      videoId,
      targetLanguage,
      targetLanguageLabel: language.label,
      cues: translated,
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
