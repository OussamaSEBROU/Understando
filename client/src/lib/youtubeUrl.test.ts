import { describe, expect, it } from "vitest";

import { getYouTubeVideoId } from "./youtubeUrl";

describe("getYouTubeVideoId", () => {
  it("accepts standard, short and shorts YouTube links", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=4")).toBe("dQw4w9WgXcQ");
    expect(getYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-YouTube addresses and incomplete IDs", () => {
    expect(getYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(getYouTubeVideoId("https://youtu.be/too-short")).toBeNull();
  });
});
