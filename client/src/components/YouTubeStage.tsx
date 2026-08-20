import { useLanguage } from "@/contexts/LanguageContext";
import { useVideoSync } from "@/hooks/useVideoSync";
import { clampPlaybackTime, getDoubleTapSeekOffset, getSeekTarget } from "@/lib/playerControls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SubtitleCue } from "../../../shared/translation";
import { Focus, Maximize2, Minimize2, Settings2, Undo2 } from "lucide-react";
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
  isFocusMode: boolean;
  isPreparingNext: boolean;
  onDurationChange: (duration: number) => void;
  onToggleFocusMode: () => void;
};

type SubtitleSize = "tiny" | "small" | "medium" | "large";

const subtitleSizeClasses: Record<SubtitleSize, string> = {
  tiny: "text-xs sm:text-sm md:text-base",
  small: "text-sm sm:text-base md:text-lg",
  medium: "text-base sm:text-lg md:text-xl",
  large: "text-lg sm:text-xl md:text-2xl",
};

export function YouTubeStage({ videoId, cues, subtitleDirection, isFocusMode, isPreparingNext, onDurationChange, onToggleFocusMode }: YouTubeStageProps) {
  const { t } = useLanguage();
  const stageRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerInstance | null>(null);
  const lastTouchRef = useRef<{ side: "back" | "forward"; timestamp: number } | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [subtitleSize, setSubtitleSize] = useState<SubtitleSize>("medium");
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const activeCue = useVideoSync(playerRef, cues);

  const seekTo = (seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const target = clampPlaybackTime(seconds, player.getDuration());
    player.seekTo(target, true);
    setPlaybackTime(target);
  };

  const seekBy = (offsetSeconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    seekTo(getSeekTarget(player.getCurrentTime(), player.getDuration(), offsetSeconds));
  };

  const handleSeekZoneTap = (side: "back" | "forward") => {
    const now = Date.now();
    const lastTap = lastTouchRef.current;
    if (lastTap?.side === side && now - lastTap.timestamp < 320) {
      seekBy(getDoubleTapSeekOffset(side));
      lastTouchRef.current = null;
      return;
    }
    lastTouchRef.current = { side, timestamp: now };
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === stageRef.current) {
      await document.exitFullscreen();
      return;
    }
    await stageRef.current?.requestFullscreen();
  };

  useEffect(() => {
    const syncFullscreenState = () => setIsStageFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!isPlayerReady) return;
    let frame = 0;
    let lastRenderedAt = 0;
    let lastDuration = 0;
    const syncTimeline = (timestamp: number) => {
      const player = playerRef.current;
      if (player && timestamp - lastRenderedAt > 120) {
        const currentTime = player.getCurrentTime();
        const nextDuration = player.getDuration();
        if (Number.isFinite(currentTime)) setPlaybackTime(currentTime);
        if (Number.isFinite(nextDuration) && nextDuration > 0) {
          setDuration(nextDuration);
          if (Math.abs(nextDuration - lastDuration) > 0.01) {
            lastDuration = nextDuration;
            onDurationChange(nextDuration);
          }
        }
        lastRenderedAt = timestamp;
      }
      frame = window.requestAnimationFrame(syncTimeline);
    };
    frame = window.requestAnimationFrame(syncTimeline);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlayerReady, onDurationChange]);

  useEffect(() => {
    if (!videoId || !mountRef.current) return;
    let disposed = false;
    let player: PlayerInstance | null = null;
    setPlayerError(null);
    setIsPlayerReady(false);
    setPlaybackTime(0);
    setDuration(0);
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
            fs: 0,
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
    <section ref={stageRef} className="youtube-stage surface-shine relative aspect-video w-full overflow-hidden border border-white/30 bg-black touch-manipulation" aria-label={t.playerLabel} aria-busy={videoId ? !isPlayerReady : undefined}>
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
        <>
          <div className="absolute inset-x-3 bottom-3 z-30 flex items-center gap-2 rounded-sm bg-black/45 px-2 py-1.5 backdrop-blur-sm sm:inset-x-4 sm:bottom-4" dir="ltr">
            <input
              type="range"
              min="0"
              max={Math.max(0, duration)}
              step="0.1"
              value={Math.min(playbackTime, Math.max(0, duration))}
              disabled={duration <= 0}
              aria-label={t.videoTimeline}
              className="h-5 min-w-0 flex-1 cursor-pointer accent-red-600 disabled:cursor-not-allowed"
              onChange={event => seekTo(Number(event.currentTarget.value))}
            />
          </div>
          <div className="absolute end-3 top-3 z-30">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex size-11 items-center justify-center border border-white/30 bg-black/65 text-white backdrop-blur-sm transition-colors hover:border-red-500 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 sm:size-10" aria-label={t.subtitleSettings} title={t.subtitleSettings}>
                  <Settings2 className="size-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-white/30 bg-black/95 p-1.5 text-white backdrop-blur-xl">
                <div dir={subtitleDirection}>
                <DropdownMenuLabel className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">{t.subtitleControls}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => seekBy(-10)} className="cursor-pointer text-white focus:bg-red-600 focus:text-white">
                  <Undo2 className="size-4" /> {t.seekBack}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => seekBy(10)} className="cursor-pointer text-white focus:bg-red-600 focus:text-white">
                  <span className="flex size-4 items-center justify-center text-xs font-black">+10</span> {t.seekForward}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/20" />
                <DropdownMenuLabel className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">{t.subtitleSizeLabel}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={subtitleSize} onValueChange={value => setSubtitleSize(value as SubtitleSize)}>
                  {([
                    ["tiny", t.subtitleSizeTiny],
                    ["small", t.subtitleSizeSmall],
                    ["medium", t.subtitleSizeMedium],
                    ["large", t.subtitleSizeLarge],
                  ] as const).map(([size, label]) => (
                    <DropdownMenuRadioItem key={size} value={size} className="cursor-pointer text-white focus:bg-red-600 focus:text-white">
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator className="bg-white/20" />
                <DropdownMenuItem onSelect={() => void toggleFullscreen()} className="cursor-pointer text-white focus:bg-red-600 focus:text-white">
                  <Maximize2 className="size-4" /> {t.fullscreen}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onToggleFocusMode} className="cursor-pointer text-white focus:bg-red-600 focus:text-white">
                  <Focus className="size-4" /> {isFocusMode ? t.exitFocusMode : t.focusMode}
                </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button type="button" className="absolute inset-y-0 start-0 z-20 w-[27%] cursor-default bg-transparent" aria-label={t.seekBack} onPointerUp={event => { if (event.pointerType === "touch") handleSeekZoneTap("back"); }} onDoubleClick={() => seekBy(getDoubleTapSeekOffset("back"))} />
          <button type="button" className="absolute inset-y-0 end-0 z-20 w-[27%] cursor-default bg-transparent" aria-label={t.seekForward} onPointerUp={event => { if (event.pointerType === "touch") handleSeekZoneTap("forward"); }} onDoubleClick={() => seekBy(getDoubleTapSeekOffset("forward"))} />
        </>
      )}
      {isStageFullscreen && (
        <button type="button" className="absolute end-3 top-3 z-40 flex size-11 items-center justify-center border border-white/30 bg-black/70 text-white backdrop-blur-sm hover:border-red-500 sm:end-4 sm:top-4 sm:size-10" onClick={() => void toggleFullscreen()} aria-label={t.exitFullscreen} title={t.exitFullscreen}>
          <Minimize2 className="size-4" aria-hidden="true" />
        </button>
      )}
      {activeCue?.translated && (
        <div className="subtitle-layer pointer-events-none absolute inset-x-0 bottom-[13%] z-25 px-3 text-center sm:bottom-[11%] sm:px-14" dir={subtitleDirection}>
          <p className={`inline bg-black/30 px-2.5 py-1.5 font-bold leading-snug tracking-normal text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)] backdrop-blur-[1px] ${subtitleSizeClasses[subtitleSize]}`}>
            {activeCue.translated}
          </p>
        </div>
      )}
      {videoId && isPreparingNext && !activeCue?.translated && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[18%] z-25 px-4 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/60" role="status">
          {t.preparingNextSegment}
        </p>
      )}
    </section>
  );
}
