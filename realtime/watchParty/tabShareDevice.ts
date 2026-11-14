/**
 * Tab Share, on a device: joins the Watch Party's Tab Share mode
 * (`./tabShare.ts` on the server) to the Call, which carries the shared tab
 * (`shareTab` in `../call/device.ts`). Framework-free; Vue reaches it
 * through `useTabShare()` (`composables/useTabShare.ts`).
 *
 * Tab Share needs the Call: starting it joins the Call on the sharer's
 * device, if it is not in it (the other Viewer joins to watch). It lasts as
 * long as the sharer's device shares the tab in the Call: once it no longer
 * does (the Viewer pressed the browser's "Stop sharing", left the Call, or
 * moved it or the Watch Party to another device), that device stops the Tab
 * Share. The Watch Party goes on, as it does whenever a Viewer leaves the
 * Call. And when the Tab Share stops (either Viewer stopped it, or the Watch
 * Party ended), the sharer's device stops sharing the tab.
 */
import type { Viewer } from "../../models/Viewer";
import type { SourceId } from "../../utils/sources";
import type { DeviceCall, MediaProblem } from "../call/device";
import type { Clock, TimerId } from "../clock";
import type { DeviceClient } from "../deviceClient";
import { createListeners } from "../listeners";
import type { DeviceWatchParty } from "./device";
import { sharesTab, type WatchPartyState } from "./protocol";
import { canShareTab } from "./tabShare";

export interface TabShareState {
  /** The Viewer is choosing the tab to share (the browser's picker), or this device is joining the Call for it. */
  starting: boolean;
  /** This device shares its tab in the Watch Party's Tab Share. */
  sharingHere: boolean;
  /** Why the last try to share a tab from here did not start (see `MediaProblem`); null otherwise. */
  problem: MediaProblem | null;
}

export interface DeviceTabShare {
  readonly state: TabShareState;
  /** Whether this device can start a Tab Share now: it takes part, and the Watch Party is under way. */
  readonly canStart: boolean;
  /**
   * Shares this device's tab, playing `source` (any Source), in the Watch
   * Party it takes part in. Call it from the Viewer's click: the browser
   * asks for the tab only then.
   */
  start(source: SourceId): Promise<void>;
  /** The sharer plays another Source in the shared tab. */
  changeSource(source: SourceId): void;
  /** Stops the Tab Share for both Viewers, from either one's device. */
  stop(): void;
  /** Calls `listener` after every change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

export interface DeviceTabShareOptions {
  client: DeviceClient;
  watchParty: DeviceWatchParty;
  call: DeviceCall;
  clock: Clock;
}

/** How long a started Tab Share may take to show in the shared state; after that, the coordinator refused it. */
const START_TIMEOUT_MS = 10_000;

export function createDeviceTabShare({ client, watchParty, call, clock }: DeviceTabShareOptions): DeviceTabShare {
  const listeners = createListeners();
  /** While this device starts a Tab Share: for which Watch Party, and (once asked for) until when it waits. */
  let starting: { partyId: string; timer: TimerId | null } | null = null;
  let problem: MediaProblem | null = null;
  /** The Watch Party this device asked to stop the Tab Share of, until the shared state shows it stopped. */
  let stopping: string | null = null;

  function changed() {
    listeners.notify();
  }

  function me(): Viewer | null {
    return client.identity?.viewer ?? null;
  }

  /** The Watch Party this device takes part in; null when it takes part in none. */
  function partyHere(): WatchPartyState | null {
    const party = watchParty.party;
    return party && party.phase.name !== "ended" && watchParty.activeHere ? party : null;
  }

  /** Whether the shared state says this device shares its tab. */
  function sharingHere() {
    const party = partyHere();
    return party?.mode === "tab-share" && sharesTab(party, me());
  }

  function doneStarting() {
    if (starting?.timer) clock.clearTimeout(starting.timer);
    starting = null;
  }

  /**
   * Keeps the Call and the shared state in agreement: the Tab Share lasts
   * while this device shares the tab in the Call, and the Call shares it
   * while the Tab Share lasts.
   */
  function settle() {
    const party = partyHere();
    const shares = sharingHere();
    if (starting && (shares || party?.id !== starting.partyId)) doneStarting();
    if (!shares) stopping = null;
    if (starting) return;
    if (shares && !call.state.tab.sharing && stopping !== party!.id) {
      stopping = party!.id;
      client.send({ type: "watchParty:stopTabShare", partyId: party!.id });
    } else if (!shares && call.state.tab.sharing) {
      call.stopSharingTab();
    }
  }

  function update() {
    settle();
    changed();
  }

  watchParty.subscribe(update);
  call.subscribe(update);

  return {
    get state() {
      return { starting: starting !== null, sharingHere: sharingHere(), problem };
    },

    get canStart() {
      const party = partyHere();
      const viewer = me();
      return !!party && !!viewer && party.mode !== "tab-share" && canShareTab(party, viewer);
    },

    async start(source) {
      const party = partyHere();
      const viewer = me();
      if (starting || !party || !viewer || !canShareTab(party, viewer)) return;
      starting = { partyId: party.id, timer: null };
      problem = null;
      changed();
      const shared = await call.shareTab();
      if (starting?.partyId !== party.id) return;
      if (!shared) {
        problem = call.state.tab.problem;
        doneStarting();
        return update();
      }
      client.send({ type: "watchParty:tabShare", partyId: party.id, source, sound: call.state.tab.sound });
      starting.timer = clock.setTimeout(() => {
        starting = null;
        update();
      }, START_TIMEOUT_MS);
    },

    changeSource(source) {
      const party = partyHere();
      if (!party || !sharingHere() || party.tabShare?.source === source) return;
      client.send({ type: "watchParty:tabShare", partyId: party.id, source, sound: call.state.tab.sound });
    },

    stop() {
      const party = partyHere();
      if (party?.mode !== "tab-share") return;
      client.send({ type: "watchParty:stopTabShare", partyId: party.id });
    },

    subscribe: listeners.subscribe,
  };
}
