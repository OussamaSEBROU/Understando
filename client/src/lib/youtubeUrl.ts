const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function getYouTubeVideoId(value: string): string | null {
  const trimmed = value.trim();
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    if (!host.endsWith("youtube.com")) return null;

    const paths = url.pathname.split("/").filter(Boolean);
    const id = url.searchParams.get("v") ?? (paths[0] === "shorts" || paths[0] === "embed" || paths[0] === "live" ? paths[1] : null);
    return id && VIDEO_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}
