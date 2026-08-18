import { useLanguage } from "@/contexts/LanguageContext";
import { useVideoSync } from "@/hooks/useVideoSync";
import { getSeekTarget } from "@/lib/playerControls";
import type { SubtitleCue } from "../../../shared/translation";
import { useEffect, useRef, useState } from "react";

type PlayerInstance = {
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  destroy: () => void;
};

type PlayerReadyEvent = {
  target: PlayerInstance;
};

type YouTubeApi = {
  Player: new (target: HTMLElement, options: Record<string, unknown>) => PlayerInstance;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<YouTubeApi> | null = null;

const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiReady) return apiReady;

  apiReady = new Promise<YouTubeApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const finish = () => {
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player API did not initialize."));
    };
    const priorCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      priorCallback?.();
      finish();
    };

    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("YouTube player API could not be loaded."));
      document.head.appendChild(script);
    }
  });
  return apiReady;
};

type YouTubeStageProps = {
  videoId: string | null;
  cues: SubtitleCue[];
  subtitleDirection: "rtl" | "ltr";
};

type SubtitleSize = "small" | "medium" | "large";

const subtitleSizeClasses: Record<SubtitleSize, string> = {
  small: "text-sm sm:text-base md:text-lg",
  medium: "text-base sm:text-lg md:text-xl",
  large: "text-lg sm:text-xl md:text-2xl",
};

export function YouTubeStage({ videoId, cues, subtitleDirection }: YouTubeStageProps) {
  const { t } = useLanguage();
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerInstance | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [subtitleSize, setSubtitleSize] = useState<SubtitleSize>("medium");
  const activeCue = useVideoSync(playerRef, cues);

  const seekBy = (offsetSeconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(getSeekTarget(player.getCurrentTime(), player.getDuration(), offsetSeconds), true);
  };

  useEffect(() => {
    if (!videoId || !mountRef.current) return;
    let disposed = false;
    let player: PlayerInstance | null = null;
    setPlayerError(null);
    setIsPlayerReady(false);
    mountRef.current.replaceChildren();

    void loadYouTubeApi()
      .then(YT => {
        if (disposed || !mountRef.current) return;
        player = new YT.Player(mountRef.current, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            cc_load_policy: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: PlayerReadyEvent) => {
              if (disposed) return;
              playerRef.current = event.target;
              setIsPlayerReady(true);
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) setPlayerError(t.playerLoadError);
      });

    return () => {
      disposed = true;
      player?.destroy();
      playerRef.current = null;
    };
  }, [t.playerLoadError, videoId]);

  return (
    <section className="relative aspect-video w-full overflow-hidden border border-white/30 bg-black" aria-label={t.playerLabel} aria-busy={videoId ? !isPlayerReady : undefined}>
      {videoId ? (
        <div ref={mountRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
      ) : (
        <div className="flex h-full items-center justify-center px-8 text-center">
          <div className="w-full max-w-xl border-y border-white/25 py-6">
            <div className="flex items-center justify-between font-mono text-[10px] font-bold tracking-[0.22em] text-red-500" dir="ltr">
              <span>00:00:00.000</span>
              <span>{t.captionsReady}</span>
            </div>
            <p className="mt-5 text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl">{t.emptyPlayerTitle}</p>
            <p className="mt-3 text-xs font-semibold leading-relaxed text-white/50">{t.emptyPlayerBody}</p>
            <div className="mt-6 flex items-center gap-2" dir="ltr" aria-hidden="true">
              <span className="h-px w-10 bg-red-600" />
              <span className="h-px flex-1 bg-white/25" />
              <span className="font-mono text-[10px] text-white/45">SUB / 01</span>
            </div>
          </div>
        </div>
      )}
      {playerError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 px-8 text-center" role="alert">
          <p className="border-s-2 border-red-600 ps-3 text-sm font-semibold leading-relaxed text-white">{playerError}</p>
        </div>
      )}
      {videoId && isPlayerReady && (
        <div className="absolute end-3 top-3 z-20 flex items-center gap-1 border border-white/30 bg-black/65 p-1.5 text-white backdrop-blur-sm" role="group" aria-label={t.subtitleControls}>
          <div className="flex items-center gap-1" dir="ltr">
            <button type="button" className="min-w-9 border border-white/25 px-1.5 py-1 font-mono text-xs font-bold transition-colors hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500" onClick={() => seekBy(-10)} aria-label={t.seekBack} title={t.seekBack}>
              −10
            </button>
            <button type="button" className="min-w-9 border border-white/25 px-1.5 py-1 font-mono text-xs font-bold transition-colors hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500" onClick={() => seekBy(10)} aria-label={t.seekForward} title={t.seekForward}>
              +10
            </button>
          </div>
          <span className="h-5 w-px bg-white/25" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span className="sr-only">{t.subtitleSizeLabel}</span>
            {([
              ["small", t.subtitleSizeSmall],
              ["medium", t.subtitleSizeMedium],
              ["large", t.subtitleSizeLarge],
            ] as const).map(([size, label]) => (
              <button
                key={size}
                type="button"
                className={`min-w-7 border px-1.5 py-1 font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 ${subtitleSize === size ? "border-red-500 bg-red-600 text-white" : "border-white/25 text-white hover:bg-white hover:text-black"}`}
                onClick={() => setSubtitleSize(size)}
                aria-pressed={subtitleSize === size}
                aria-label={`${t.subtitleSizeLabel}: ${label}`}
                title={`${t.subtitleSizeLabel}: ${label}`}
              >
                A
              </button>
            ))}
          </div>
        </div>
      )}
      {activeCue?.translated && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[11%] z-10 px-5 text-center sm:px-14" dir={subtitleDirection}>
          <p className={`inline bg-black/30 px-2.5 py-1.5 font-bold leading-snug tracking-normal text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)] backdrop-blur-[1px] ${subtitleSizeClasses[subtitleSize]}`}>
            {activeCue.translated}
          </p>
        </div>
      )}
    </section>
  );
}
