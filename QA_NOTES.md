# QA notes

## Interface language toggle

Verified in the live development preview on 18 August 2026. The language control initially exposed the Arabic interface and an accessible label to switch to English. Activating it immediately changed the interface copy to English, changed the accessible label to switch back to Arabic, and updated the page direction to left-to-right. The selected subtitle language remained unchanged, as intended.

## Typography

The Arabic mobile preview loads the Montserrat Arabic weights registered through the app static-asset paths. The English preview retains Montserrat for the Latin interface.

## Translation request state

The live preview was exercised with a YouTube link on 18 August 2026. While the request was pending, the button, sidebar, and live-status text all presented the non-technical capacity-organising state. The supplied video did not expose usable captions through the transcript source, and the interface correctly returned the localized, non-technical caption-availability message. This input therefore could not validate in-player subtitle timing and requires a caption source that the transcript provider can retrieve.

## Synchronisation test

The local transcript source successfully returned captions for `dQw4w9WgXcQ`. Its translation request was started in the live preview with Arabic selected; the preview remained in the capacity-organising state at the first check, so the player overlay is being observed until the request completes.

The first request exposed an empty-result edge case in the embedded fallback path. The server now explicitly uses an available fast translation model and normalizes both string and multipart text content before parsing the response. Unit coverage was added, all 13 unit tests passed, and the live request was restarted with the same caption-bearing video.

The repaired live request completed successfully with 61 timed Arabic captions. The extracted timing data confirms that the first visible lyric begins at 18.640 seconds; the overlay correctly remains absent at the observed 17-second player position because no caption is active in that interval. The next check will be taken after the first cue becomes active.

The player integration was then simplified so the synchronization loop uses the same local player reference that receives the official YouTube `onReady` event. The cached Arabic translation was loaded again successfully, with 61 timed captions available; the next live playback check is using this revised wiring.

The final live playback check succeeded. During an active lyric interval, the custom RTL overlay displayed `♪ لسنا غرباء عن الحب ♪` above the YouTube player and matched the loaded Arabic caption sequence. The previous issue was caused by passing the player reference through the component boundary; keeping the synchronization loop beside the IFrame API instance resolves it.

The subtitle style was revised to a regular video-caption scale (`16px`, increasing responsively to `20px`) with a light translucent background and a text shadow. The full automated suite then passed: 4 test files and 15 tests, followed by a clean TypeScript check. A live visual check is in progress on the cached 61-caption Arabic translation.

The live visual check succeeded. The active Arabic cue `♪ التزام تام هو ما أفكر فيه ♪` appeared at a regular subtitle size over a translucent background. It remained legible over a bright outdoor video frame while no longer using the previous heavy opaque black panel.
