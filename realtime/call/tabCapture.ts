/**
 * Tab Share's capture in the browser: the shared tab's picture and sound,
 * which the Call sends in its tab slots (`CALL_SLOTS`). Used by
 * `browserCallPlatform` only: tests pass fakes.
 *
 * The picker offers this tab first (`preferCurrentTab`), so the sharer
 * keeps the Call's tiles and the Watch Party's controls over the Source
 * they share. Only desktop Chrome and Edge share a tab's sound; Firefox and
 * Safari share the picture alone, and phones cannot share a tab at all.
 *
 * Echo (not verified in a browser): a tab's sound is everything the tab
 * plays, the Call's voice included, so the other Viewer may hear themselves,
 * a moment late, in the shared sound. No browser offers a way to leave the
 * page's own sound out of a capture of its own tab and keep the Source's:
 * - `restrictOwnAudio` (Chrome 140+, Windows and macOS only) filters the
 *   capturing page's sound out of a capture that includes *system* audio (a
 *   screen or window). A tab capture has none, so Chrome applies nothing
 *   here. Were a browser to apply it to its own tab, the spec says it
 *   removes the sound "produced by the document that performed
 *   getDisplayMedia": the Source plays in another (cross-origin) document,
 *   but whether a browser would keep it is untested, so it is not asked for.
 * - `suppressLocalAudioPlayback` only stops the tab playing out loud here.
 * Sharing another tab instead (the Source opened on its own) avoids the echo:
 * the picker offers other tabs too.
 */
import type { TabCapture } from "./platform";

/** `getDisplayMedia` options that `lib.dom` does not know yet (Chrome's screen-sharing controls). */
interface TabCaptureOptions extends DisplayMediaStreamOptions {
  /** Chrome 94+: offers this tab first. */
  preferCurrentTab?: boolean;
  /** Chrome 112+: must not be "exclude" alongside `preferCurrentTab`. */
  selfBrowserSurface?: "include" | "exclude";
  /** Chrome 105+: only for whole screens, which are not offered. */
  systemAudio?: "include" | "exclude";
  /** Chrome 107+: no "share this tab instead" button mid-share. */
  surfaceSwitching?: "include" | "exclude";
  /** Chrome 119+: no whole screens: a tab is what is shared. */
  monitorTypeSurfaces?: "include" | "exclude";
}

const OPTIONS: TabCaptureOptions = {
  video: { displaySurface: "browser" },
  audio: true,
  preferCurrentTab: true,
  selfBrowserSurface: "include",
  systemAudio: "exclude",
  surfaceSwitching: "exclude",
  monitorTypeSurfaces: "exclude",
};

/** Asks the Viewer for a tab to share. Call it from the click: browsers refuse it otherwise. */
export async function captureBrowserTab(): Promise<TabCapture> {
  if (!globalThis.navigator?.mediaDevices?.getDisplayMedia) {
    throw new DOMException("This browser cannot share a tab", "NotSupportedError");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia(OPTIONS);
  const [video] = stream.getVideoTracks();
  if (!video) {
    for (const track of stream.getTracks()) track.stop();
    throw new DOMException("No picture to share", "NotFoundError");
  }
  // A movie: smooth motion over sharp still detail, and its sound as it is, not as a voice.
  video.contentHint = "motion";
  const audio = stream.getAudioTracks()[0] ?? null;
  if (audio) audio.contentHint = "music";
  return {
    video,
    audio,
    onEnded(listener) {
      video.addEventListener("ended", listener, { once: true });
    },
  };
}
