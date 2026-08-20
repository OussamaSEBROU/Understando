import { YouTubeStage } from "@/components/YouTubeStage";
import { useLanguage } from "@/contexts/LanguageContext";
import { mergeProgressiveCues } from "@/lib/progressiveCues";
import { getYouTubeVideoId } from "@/lib/youtubeUrl";
import { trpc } from "@/lib/trpc";
import {
  PROGRESSIVE_SEGMENT_SECONDS,
  TRANSLATION_LANGUAGES,
  type SubtitleCue,
  type TargetLanguageCode,
} from "../../../shared/translation";
import { ArrowRight, Languages, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const { direction, interfaceLanguage, t, toggleLanguage } = useLanguage();
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState<TargetLanguageCode>("ar");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [nextSegmentStart, setNextSegmentStart] = useState<number | null>(null);
  const [activeTranslation, setActiveTranslation] = useState<{
    requestId: number;
    youtubeUrl: string;
    targetLanguage: TargetLanguageCode;
  } | null>(null);
  const requestIdRef = useRef(0);
  const openingSegment = trpc.video.translateSegment.useMutation();
  const backgroundSegment = trpc.video.translateSegment.useMutation();

  const selectedLanguage = TRANSLATION_LANGUAGES.find(item => item.code === language) ?? TRANSLATION_LANGUAGES[0];
  const latestError = openingSegment.error ?? backgroundSegment.error;
  const rawError = latestError?.message.toLowerCase() ?? "";
  const friendlyError = !latestError
    ? null
    : latestError.data?.code === "TOO_MANY_REQUESTS"
      ? rawError.includes("today") || rawError.includes("budget")
        ? t.dailyCapacity
        : t.queueBusy
      : rawError.includes("valid youtube") || rawError.includes("usable youtube video id")
        ? t.invalidLink
        : rawError.includes("captions")
          ? t.noCaptions
          : t.translationFailed;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validVideoId = getYouTubeVideoId(url);
    if (!validVideoId) {
      setVideoId(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setCues([]);
    setVideoId(null);
    setVideoDuration(null);
    setNextSegmentStart(null);
    setActiveTranslation({ requestId, youtubeUrl: url, targetLanguage: language });
    openingSegment.reset();
    backgroundSegment.reset();
    openingSegment.mutate(
      {
        youtubeUrl: url,
        targetLanguage: language,
        startSec: 0,
        endSec: PROGRESSIVE_SEGMENT_SECONDS,
      },
      {
        onSuccess: result => {
          if (requestIdRef.current !== requestId) return;
          setVideoId(result.videoId);
          setCues(result.cues);
          setNextSegmentStart(result.endSec);
        },
      }
    );
  };

  useEffect(() => {
    if (!activeTranslation || nextSegmentStart === null || backgroundSegment.isPending) return;

    const durationCeiling = videoDuration && videoDuration > 0 ? Math.ceil(videoDuration) : null;
    if (durationCeiling !== null && nextSegmentStart >= durationCeiling) {
      setNextSegmentStart(null);
      return;
    }

    const endSec = durationCeiling === null
      ? nextSegmentStart + PROGRESSIVE_SEGMENT_SECONDS
      : Math.min(nextSegmentStart + PROGRESSIVE_SEGMENT_SECONDS, durationCeiling);
    const requestId = activeTranslation.requestId;

    backgroundSegment.mutate(
      {
        youtubeUrl: activeTranslation.youtubeUrl,
        targetLanguage: activeTranslation.targetLanguage,
        startSec: nextSegmentStart,
        endSec,
      },
      {
        onSuccess: result => {
          if (requestIdRef.current !== requestId) return;
          setCues(previous => mergeProgressiveCues(previous, result.cues));
          setNextSegmentStart(result.endSec);
        },
        onError: () => {
          if (requestIdRef.current === requestId) setNextSegmentStart(null);
        },
      }
    );
  }, [activeTranslation, backgroundSegment, nextSegmentStart, videoDuration]);

  const isPreparing = openingSegment.isPending || backgroundSegment.isPending;
  const isPreparingNext = videoId !== null && (backgroundSegment.isPending || nextSegmentStart !== null);

  return (
    <div className="app-shell min-h-screen w-full max-w-full overflow-x-clip bg-black text-white selection:bg-red-600 selection:text-white">
      <header className={`border-b border-white/20 px-4 py-4 sm:px-8 sm:py-5 lg:px-12 ${isFocusMode ? "hidden" : ""}`}>
        <div className="mx-auto flex w-full max-w-7xl flex-col items-end gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.28em] text-white/55 sm:text-[10px] sm:tracking-[0.35em]">{t.liveSubtitleTranslation}</p>
            <h1 className="max-w-full font-display text-[clamp(2.4rem,12vw,5.4rem)] font-black uppercase leading-none tracking-[-0.07em]">Understand</h1>
          </div>
          <div className="flex items-end gap-4 sm:gap-7">
            <p className="hidden max-w-45 text-end text-[10px] font-bold uppercase leading-relaxed tracking-[0.15em] text-white/50 sm:block">{t.tagline}</p>
            <button type="button" onClick={toggleLanguage} aria-label={t.switchLanguage} title={t.switchLanguage} className="flex size-11 shrink-0 items-center justify-center border border-white/35 text-white transition-colors duration-150 hover:border-red-500 hover:text-red-400 active:scale-[0.97]">
              <Languages className="size-4" aria-hidden="true" />
              <span className="sr-only">{interfaceLanguage === "ar" ? "EN" : "ع"}</span>
            </button>
          </div>
        </div>
      </header>

      <div className={`shine-rule h-2 ${isFocusMode ? "hidden" : ""}`} aria-hidden="true" />

      <main className={isFocusMode ? "flex min-h-screen w-full items-center bg-black p-0 sm:p-8" : "mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12"}>
        <div className={`min-w-0 ${isFocusMode ? "w-full" : ""}`}>
          <section className={`${isFocusMode ? "hidden" : "border-b border-white/30 pb-7 sm:pb-8"}`}>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-red-500">01 / {t.videoSource}</p>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
              <label className="sr-only" htmlFor="youtube-url">{t.youtubeUrlLabel}</label>
              <input id="youtube-url" value={url} onChange={event => setUrl(event.target.value)} placeholder={t.youtubeUrlPlaceholder} inputMode="url" required className="h-14 min-w-0 border border-white/35 bg-black px-4 text-base font-semibold text-white outline-none placeholder:text-white/35 focus:border-red-500 focus:ring-1 focus:ring-red-500 sm:h-13 sm:text-sm" />
              <label className="sr-only" htmlFor="target-language">{t.targetLanguage}</label>
              <select id="target-language" value={language} onChange={event => setLanguage(event.target.value as TargetLanguageCode)} className="h-14 border border-white/35 bg-black px-4 text-base font-bold text-white outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 sm:h-13 sm:px-3 sm:text-sm">
                {TRANSLATION_LANGUAGES.map(item => <option key={item.code} value={item.code} className="bg-black text-white">{item.label}</option>)}
              </select>
              <button type="submit" disabled={isPreparing || !url.trim()} className="surface-shine flex h-14 items-center justify-center gap-2 bg-red-600 px-5 text-sm font-black uppercase tracking-[0.14em] text-white transition-transform duration-150 ease-out hover:bg-red-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-white/15 sm:h-13 sm:text-xs sm:tracking-[0.18em]">
                {isPreparing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
                {isPreparing ? t.prepare : t.translate}
              </button>
            </form>
            {openingSegment.isPending && <p role="status" className="mt-3 text-xs font-semibold text-white/65">{t.preparingOpeningSegment}</p>}
            {videoId && isPreparingNext && <p role="status" className="mt-3 text-xs font-semibold text-white/65">{t.preparingNextSegment}</p>}
            {friendlyError && <p role="alert" className="mt-3 border-s-2 border-red-600 ps-3 text-sm font-medium text-red-300">{friendlyError}</p>}
          </section>

          <section className={isFocusMode ? "w-full" : "pt-7 sm:pt-8"}>
            <div className={`mb-3 flex items-center justify-between gap-3 ${isFocusMode ? "hidden" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-500">02 / {t.synchronizedPlayer}</p>
              {cues.length > 0 && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{cues.length} {t.timedCaptions}</p>}
            </div>
            <YouTubeStage
              videoId={videoId}
              cues={cues}
              subtitleDirection={selectedLanguage.dir}
              isFocusMode={isFocusMode}
              isPreparingNext={isPreparingNext}
              onDurationChange={setVideoDuration}
              onToggleFocusMode={() => setIsFocusMode(value => !value)}
            />
          </section>
        </div>
      </main>

    </div>
  );
}
