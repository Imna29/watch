import { useQueryClient } from "@tanstack/vue-query";
import { systemClock } from "~/realtime/clock";
import type { EndedNotice, LeftNotice, StartChoice } from "~/realtime/watchParty/device";
import type { EpisodeGuide } from "~/realtime/watchParty/episodeGuide";
import { createPartySync, type PartySyncView } from "~/realtime/watchParty/partySync";
import type { WatchPartyState } from "~/realtime/watchParty/protocol";
import type { PlayerFrame } from "~/realtime/watchParty/sources/adapter";
import type { Viewer } from "~/models/Viewer";

export interface WatchPartySnapshot {
  /** Whether this device is connected, so "Watch together" can reach the other Viewer. */
  connected: boolean;
  /** Who is signed in on this device; null until connected. */
  viewer: Viewer | null;
  party: WatchPartyState | null;
  activeHere: boolean;
  /** The Watch Party whose player this device shows (the layout's `<WatchPartyPlayer>`). */
  playerParty: WatchPartyState | null;
  left: LeftNotice | null;
  elsewhere: WatchPartyState | null;
  continuedElsewhere: boolean;
  invite: WatchPartyState | null;
  choice: StartChoice | null;
  ended: EndedNotice | null;
}

/**
 * This device's side of the Watch Party (`realtime/watchParty/device.ts`):
 * the shared state, the invite and choices, as a ref updated after every
 * change, plus the intents.
 */
export function useWatchParty() {
  const { client, watchParty } = useRealtime();
  const read = (): WatchPartySnapshot => ({
    connected: client.status === "connected",
    viewer: client.identity?.viewer ?? null,
    party: watchParty.party,
    activeHere: watchParty.activeHere,
    playerParty: watchParty.playerParty,
    left: watchParty.left,
    elsewhere: watchParty.elsewhere,
    continuedElsewhere: watchParty.continuedElsewhere,
    invite: watchParty.invite,
    choice: watchParty.choice,
    ended: watchParty.ended,
  });
  const state = shallowRef(read());
  const update = () => {
    state.value = read();
  };
  const stopParty = watchParty.subscribe(update);
  const stopStatus = client.onStatus(update);
  onScopeDispose(() => {
    stopParty();
    stopStatus();
  });

  return {
    state: shallowReadonly(state),
    start: watchParty.start,
    join: watchParty.join,
    replace: watchParty.replace,
    dismissChoice: watchParty.dismissChoice,
    cancel: watchParty.cancel,
    dismissEnded: watchParty.dismissEnded,
    changeEpisode: watchParty.changeEpisode,
    cancelNextEpisode: watchParty.cancelNextEpisode,
    leave: watchParty.leave,
    keepWatchingAlone: watchParty.keepWatchingAlone,
    stop: watchParty.stop,
    switchSource: watchParty.switchSource,
  };
}

/**
 * Party sync (`realtime/watchParty/partySync.ts`) for the Watch Party player
 * whose Source iframe is `iframe`. Render the iframe with `src`; `view` is
 * what to show over it; `resume` is the "Click to resume" button's click.
 * Stops when the calling component unmounts.
 */
export function usePartySync(iframe: Readonly<Ref<HTMLIFrameElement | null | undefined>>) {
  const { client, watchParty } = useRealtime();
  const src = ref("");

  // The iframe as party sync sees it. Each URL gets a new iframe (the shell
  // keys it on its src), so only the current one's window is listened to.
  const frame: PlayerFrame = {
    load(url) {
      src.value = url;
    },
    post(message, targetOrigin) {
      iframe.value?.contentWindow?.postMessage(message, targetOrigin);
    },
    onMessage(listener) {
      const heard = (event: MessageEvent) => {
        const window = iframe.value?.contentWindow;
        if (window && event.source === window) listener(event.origin, event.data);
      };
      globalThis.addEventListener("message", heard);
      return () => globalThis.removeEventListener("message", heard);
    },
  };

  // The episode after one that ended, from the TV show's details (the episode picker has them already).
  const queryClient = useQueryClient();
  const episodes: EpisodeGuide = {
    episodesOf: (tmdbId) => queryClient.query(tvOptions.byId(tmdbId)),
  };

  const sync = createPartySync({ watchParty, client, clock: systemClock, frame, episodes });
  const view = shallowRef<PartySyncView>(sync.view);
  sync.subscribe(() => {
    view.value = sync.view;
  });
  onScopeDispose(() => sync.destroy());

  return { src: readonly(src), view: shallowReadonly(view), resume: () => sync.resume() };
}
