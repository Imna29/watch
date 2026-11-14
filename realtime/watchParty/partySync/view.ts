/** What party sync shows over the Watch Party player (`PartySyncView`), and who is told when it changes. */
import type { Viewer } from "../../../models/Viewer";
import { createListeners } from "../../listeners";
import type { Episode, WatchPartyChange } from "../protocol";

export interface PartySyncView {
  /** The Source's player: loading the Title, ready, or failed to load it. */
  player: "loading" | "ready" | "failed";
  /** "Waiting for Mariam…": the Viewer the Watch Party waits for; null when it waits for nobody. */
  waitingFor: Viewer | null;
  /** 3, 2, 1 before both players start; null otherwise. */
  countdown: number | null;
  /** Both Viewers are in, but a player is still loading: the countdown has not begun. */
  gettingReady: boolean;
  /**
   * The other Viewer's latest change, for a few seconds after it
   * (`describeChange` in `../changeMessage.ts` words it); null otherwise.
   */
  lastChange: WatchPartyChange | null;
  /** "Next episode in 10s · Cancel": the episode both move to, and the seconds left; null otherwise. */
  nextEpisode: { episode: Episode; secondsLeft: number } | null;
  /**
   * "Click to resume": the browser would not start the player (after a page
   * reload it may refuse until the Viewer clicks in the page). The Watch
   * Party waits for this Viewer meanwhile. The button calls `resume()`.
   */
  clickToResume: boolean;
}

export interface ViewStore {
  readonly current: PartySyncView;
  /** Changes these fields; listeners hear of it when any of them changed. */
  set(next: Partial<PartySyncView>): void;
  subscribe(listener: () => void): () => void;
  clear(): void;
}

export function createView(): ViewStore {
  const listeners = createListeners();
  let view: PartySyncView = {
    player: "loading",
    waitingFor: null,
    countdown: null,
    gettingReady: false,
    lastChange: null,
    nextEpisode: null,
    clickToResume: false,
  };
  return {
    get current() {
      return view;
    },

    set(next) {
      const changed = (Object.keys(next) as (keyof PartySyncView)[]).some((key) => next[key] !== view[key]);
      if (!changed) return;
      view = { ...view, ...next };
      listeners.notify();
    },

    subscribe: listeners.subscribe,
    clear: listeners.clear,
  };
}
