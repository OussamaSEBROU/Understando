import { YouTubeStage } from "@/components/YouTubeStage";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { TRANSLATION_LANGUAGES, type SubtitleCue, type TargetLanguageCode } from "../../../shared/translation";
import { ArrowRight, Languages, Loader2 } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const { direction, interfaceLanguage, t, toggleLanguage } = useLanguage();
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState<TargetLanguageCode>("ar");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const translation = trpc.video.translate.useMutation({
    onSuccess: result => {
      setVideoId(result.videoId);
      setCues(result.cues);
    },
  });

  const selectedLanguage = TRANSLATION_LANGUAGES.find(item => item.code === language) ?? TRANSLATION_LANGUAGES[0];
  const rawError = translation.error?.message.toLowerCase() ?? "";
  const friendlyError = !translation.error
    ? null
    : translation.error.data?.code === "TOO_MANY_REQUESTS"
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
    setCues([]);
    translation.mutate({ youtubeUrl: url, targetLanguage: language });
  };

  const sidebarBorder = direction === "rtl" ? "lg:border-r lg:pr-8" : "lg:border-l lg:pl-8";

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600 selection:text-white">
      <header className="border-b border-white/20 px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.35em] text-white/55">{t.liveSubtitleTranslation}</p>
            <h1 className="font-display text-5xl font-black uppercase leading-none tracking-[-0.07em] sm:text-7xl">Understand</h1>
          </div>
          <div className="flex items-end gap-4 sm:gap-7">
            <p className="hidden max-w-45 text-end text-[10px] font-bold uppercase leading-relaxed tracking-[0.15em] text-white/50 sm:block">{t.tagline}</p>
            <button type="button" onClick={toggleLanguage} aria-label={t.switchLanguage} title={t.switchLanguage} className="flex size-10 items-center justify-center border border-white/35 text-white transition-colors duration-150 hover:border-red-500 hover:text-red-400 active:scale-[0.97]">
              <Languages className="size-4" aria-hidden="true" />
              <span className="sr-only">{interfaceLanguage === "ar" ? "EN" : "ع"}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="h-2 bg-red-600" aria-hidden="true" />

      <main className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 lg:px-12 lg:py-12">
        <div className="min-w-0">
          <section className="border-b border-white/30 pb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-red-500">01 / {t.videoSource}</p>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
              <label className="sr-only" htmlFor="youtube-url">{t.youtubeUrlLabel}</label>
              <input id="youtube-url" value={url} onChange={event => setUrl(event.target.value)} placeholder={t.youtubeUrlPlaceholder} inputMode="url" required className="h-13 min-w-0 border border-white/35 bg-black px-4 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-red-500 focus:ring-1 focus:ring-red-500" />
              <label className="sr-only" htmlFor="target-language">{t.targetLanguage}</label>
              <select id="target-language" value={language} onChange={event => setLanguage(event.target.value as TargetLanguageCode)} className="h-13 border border-white/35 bg-black px-3 text-sm font-bold text-white outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500">
                {TRANSLATION_LANGUAGES.map(item => <option key={item.code} value={item.code} className="bg-black text-white">{item.label}</option>)}
              </select>
              <button type="submit" disabled={translation.isPending || !url.trim()} className="flex h-13 items-center justify-center gap-2 bg-red-600 px-5 text-xs font-black uppercase tracking-[0.18em] text-white transition-transform duration-150 ease-out hover:bg-red-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-white/15">
                {translation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
                {translation.isPending ? t.prepare : t.translate}
              </button>
            </form>
            {translation.isPending && <p role="status" className="mt-3 text-xs font-semibold text-white/65">{t.queueProgress}</p>}
            {friendlyError && <p role="alert" className="mt-3 border-s-2 border-red-600 ps-3 text-sm font-medium text-red-300">{friendlyError}</p>}
          </section>

          <section className="pt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-500">02 / {t.synchronizedPlayer}</p>
              {cues.length > 0 && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{cues.length} {t.timedCaptions}</p>}
            </div>
            <YouTubeStage videoId={videoId} cues={cues} subtitleDirection={selectedLanguage.dir} />
          </section>
        </div>

        <aside className={`border-t border-white/30 pt-6 lg:border-t-0 lg:pt-0 ${sidebarBorder}`}>
          <p className="mb-7 text-xs font-bold uppercase tracking-[0.24em] text-red-500">{t.playbackIndicator}</p>
          <dl className="space-y-6">
            <div><dt className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{t.language}</dt><dd className="font-display text-3xl font-black leading-none tracking-tight">{selectedLanguage.label}</dd></div>
            <div><dt className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{t.status}</dt><dd className="text-sm font-bold uppercase tracking-[0.11em] text-white">{translation.isPending ? t.building : cues.length > 0 ? t.synchronized : t.waitingForLink}</dd></div>
            <div><dt className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{t.method}</dt><dd className="text-sm leading-relaxed text-white/70">{t.methodDescription}</dd></div>
          </dl>
        </aside>
      </main>

      <footer className="border-t border-white/20 px-5 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl items-end justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{t.freeLane}</p>
          <p className="text-end text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{t.developerCredit}</p>
        </div>
      </footer>
    </div>
  );
}
