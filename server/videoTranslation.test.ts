import { describe, expect, it } from "vitest";
import { FreeQuotaGovernor, QuotaLimitError } from "./quotaGovernor";
import {
  chunkCues,
  extractYoutubeVideoId,
  llmContentToText,
  normalizeSegmentBounds,
  parseDirectVideoCues,
  parseTranslatedBlock,
  sourceCueFromTranscript,
} from "./videoTranslation";

describe("video translation contracts", () => {
  it("extracts a video ID from supported YouTube URL forms", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=2")).toBe("dQw4w9WgXcQ");
    expect(extractYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("keeps YouTube transcript timestamps in milliseconds", () => {
    expect(sourceCueFromTranscript({ offset: 1_360, duration: 1_680, text: "Caption" }, 0)).toMatchObject({
      startMs: 1_360,
      endMs: 3_040,
      source: "Caption",
    });
  });

  it("keeps source timestamps outside the model mapping", () => {
    const source = [
      { id: 0, startMs: 120, endMs: 1_200, source: "Good morning" },
      { id: 1, startMs: 1_250, endMs: 2_100, source: "How are you?" },
    ];
    const result = parseTranslatedBlock(
      '{"translations":[{"id":0,"text":"صباح الخير"},{"id":1,"text":"كيف حالك؟"}]}',
      source
    );
    expect(result).toEqual([
      { ...source[0], translated: "صباح الخير" },
      { ...source[1], translated: "كيف حالك؟" },
    ]);
  });

  it("accepts a JSON response wrapped as a JSON string", () => {
    const source = [{ id: 8, startMs: 0, endMs: 800, source: "Thank you" }];
    const wrapped = JSON.stringify('{"translations":[{"id":8,"text":"شكرًا لك"}]}');

    expect(parseTranslatedBlock(wrapped, source)).toEqual([
      { ...source[0], translated: "شكرًا لك" },
    ]);
  });

  it("normalizes a multipart embedded-model response before parsing JSON", () => {
    expect(llmContentToText([{ type: "text", text: '{"translations":[]}' }])).toBe('{"translations":[]}');
    expect(llmContentToText([])).toBeNull();
  });

  it("rejects a model response that loses a caption ID", () => {
    const source = [
      { id: 3, startMs: 0, endMs: 100, source: "One" },
      { id: 4, startMs: 100, endMs: 200, source: "Two" },
    ];
    expect(() => parseTranslatedBlock('{"translations":[{"id":3,"text":"واحد"}]}', source)).toThrow(
      "caption mapping"
    );
  });

  it("creates bounded blocks for long transcripts", () => {
    const cues = Array.from({ length: 35 }, (_, id) => ({
      id,
      startMs: id * 1_000,
      endMs: id * 1_000 + 900,
      source: "caption",
    }));
    expect(chunkCues(cues)).toHaveLength(2);
    expect(chunkCues(cues)[0]).toHaveLength(34);
  });

  it("normalizes direct-video timed translations into the player cue contract", () => {
    expect(
      parseDirectVideoCues(
        '{"cues":[{"startMs":0,"endMs":950,"text":"مرحبًا"},{"startMs":1000,"endMs":1800,"text":"بكم"}]}'
      )
    ).toEqual([
      { id: 0, startMs: 0, endMs: 950, source: "", translated: "مرحبًا" },
      { id: 1, startMs: 1000, endMs: 1800, source: "", translated: "بكم" },
    ]);
  });

  it("rejects a direct-video response without usable timed translations", () => {
    expect(() => parseDirectVideoCues('{"cues":[]}')).toThrow("usable timed translations");
  });

  it("keeps only cues overlapping the requested progressive segment", () => {
    expect(
      parseDirectVideoCues(
        '{"cues":[{"startMs":900,"endMs":1500,"text":"A"},{"startMs":1700,"endMs":2300,"text":"B"}]}',
        { startMs: 1_000, endMs: 2_000 }
      )
    ).toEqual([
      { id: 0, startMs: 1_000, endMs: 1_500, source: "", translated: "A" },
      { id: 1, startMs: 1_700, endMs: 2_000, source: "", translated: "B" },
    ]);
  });

  it("accepts a silent progressive segment without treating it as a service failure", () => {
    expect(parseDirectVideoCues('{"cues":[]}', { startMs: 30_000, endMs: 60_000 })).toEqual([]);
  });

  it("normalizes progressive segments and rejects windows above 30 seconds", () => {
    expect(normalizeSegmentBounds(30.7, 60)).toEqual({ startSec: 30, endSec: 60 });
    expect(() => normalizeSegmentBounds(0, 31)).toThrow("may not exceed 30 seconds");
  });
});

describe("free quota governor", () => {
  it("reserves minute capacity atomically and blocks excess RPM", async () => {
    let now = 1;
    const governor = new FreeQuotaGovernor(
      { rpm: 1, tpm: 1_000, rpd: 3, tpd: 3_000 },
      () => now,
      async () => undefined,
      0
    );
    await governor.reserve(300);
    await expect(governor.reserve(300)).rejects.toBeInstanceOf(QuotaLimitError);
    now = 60_201;
    await expect(governor.reserve(300)).resolves.toBeUndefined();
  });

  it("waits for the next minute window instead of rejecting a short queue", async () => {
    let now = 1;
    const waits: number[] = [];
    const governor = new FreeQuotaGovernor(
      { rpm: 1, tpm: 1_000, rpd: 3, tpd: 3_000 },
      () => now,
      async milliseconds => {
        waits.push(milliseconds);
        now += milliseconds;
      }
    );

    await governor.reserve(300);
    await expect(governor.reserve(300)).resolves.toBeUndefined();
    expect(waits[0]).toBeGreaterThanOrEqual(60_000);
  });

  it("keeps daily request and token budgets independent", async () => {
    const governor = new FreeQuotaGovernor({ rpm: 5, tpm: 1_000, rpd: 1, tpd: 900 });
    await governor.reserve(450);
    await expect(governor.reserve(450)).rejects.toMatchObject({ dimension: "RPD" });
  });

  it("queues a token-heavy next segment until the minute window is available", async () => {
    let now = 1;
    const waits: number[] = [];
    const governor = new FreeQuotaGovernor(
      { rpm: 4, tpm: 600, rpd: 4, tpd: 1_500 },
      () => now,
      async milliseconds => {
        waits.push(milliseconds);
        now += milliseconds;
      }
    );

    await governor.reserve(400);
    await governor.reserve(400);

    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(60_000);
    await expect(governor.status()).resolves.toMatchObject({ minuteRequests: 1, minuteTokens: 400 });
  });

  it("stops additional progressive segments when the daily token budget is exhausted", async () => {
    const governor = new FreeQuotaGovernor({ rpm: 4, tpm: 1_000, rpd: 4, tpd: 700 });
    await governor.reserve(400);
    await expect(governor.reserve(400)).rejects.toMatchObject({ dimension: "TPD" });
  });
});
