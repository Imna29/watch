/**
 * The Watch Party, on a device: the shared state as last heard from the
 * server, the invite and choices it implies for this Viewer, and the intents
 * this device sends. Playing the Title is party sync's job (`./partySync.ts`),
 * on the one device that takes part.
 */
import type { Viewer } from "../../models/Viewer";
import type { DeviceClient } from "../deviceClient";
import type { TitleRef } from "../presence/protocol";
import type { Episode, PlaybackChange, WatchPartyEndReason, WatchPartyState } from "./protocol";

/** How a Watch Party this device knew about ended, told to the Viewer who did not end it. */
export interface EndedNotice {
  title: TitleRef;
  episode: Episode | null;
  reason: WatchPartyEndReason;
  by: Viewer;
}

/** "Giorgi already started *Dune* · Join / Replace": what "Watch together" found. */
export interface StartChoice {
  /** The Watch Party that already exists. */
  existing: WatchPartyState;
  /** Whether this Viewer can join it: it is waiting for them. */
  canJoin: boolean;
}

export interface DeviceWatchParty {
  /** The Watch Party as last heard from the server; null when there is none. */
  readonly party: WatchPartyState | null;
  /**
   * Whether this device takes part in the Watch Party, so it shows the
   * Watch Party's player.
   */
  readonly activeHere: boolean;
  /** The Watch Party waiting for this Viewer to join; null when there is none. */
  readonly invite: WatchPartyState | null;
  /** "Watch together" found another Watch Party: join it or replace it; null otherwise. */
  readonly choice: StartChoice | null;
  /** The other Viewer ended a Watch Party: what to tell this Viewer, until dismissed. */
  readonly ended: EndedNotice | null;
  /** "Watch together" on `title` (with `episode`, for a TV show). */
  start(title: TitleRef, episode: Episode | null): void;
  /** Joins the invite (or the choice's Watch Party) from this device. */
  join(): void;
  /** Replaces the choice's Watch Party with the one this Viewer tried to start. */
  replace(): void;
  dismissChoice(): void;
  /** Ends the Watch Party for both Viewers ("Cancel" while it waits). */
  cancel(): void;
  dismissEnded(): void;
  /** Party sync: this device's player loaded Watch Party `partyId`'s Title. */
  playerReady(partyId: string): void;
  /** Party sync: the Viewer changed playback in this device's player. */
  playback(partyId: string, change: PlaybackChange): void;
  /** Calls `listener` after every change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

export function createDeviceWatchParty(client: DeviceClient): DeviceWatchParty {
  const listeners = new Set<() => void>();
  let party: WatchPartyState | null = null;
  let ended: EndedNotice | null = null;
  /** What "Watch together" last asked for. */
  let starting: { title: TitleRef; episode: Episode | null } | null = null;
  /** The Watch Party that was in the way of `starting`. */
  let inTheWay: WatchPartyState | null = null;

  function changed() {
    for (const listener of [...listeners]) listener();
  }

  function me() {
    return client.identity?.viewer ?? null;
  }

  function live() {
    return party && party.phase.name !== "ended" ? party : null;
  }

  function inviteForMe() {
    const current = live();
    return current?.phase.name === "inviting" && current.starter !== me() ? current : null;
  }

  function send(start: { title: TitleRef; episode: Episode | null }, replacing: string | null) {
    starting = start;
    inTheWay = null;
    ended = null;
    client.send({ type: "watchParty:start", ...start, replacing });
    changed();
  }

  client.on("watchParty", (message) => {
    party = message.party;
    const phase = party?.phase;
    if (party && phase?.name === "ended" && phase.by !== me()) {
      ended = { title: party.title, episode: party.episode, reason: phase.reason, by: phase.by };
    }
    changed();
  });

  client.on("watchParty:alreadyStarted", (message) => {
    inTheWay = message.party;
    changed();
  });

  return {
    get party() {
      return party;
    },

    get activeHere() {
      const identity = client.identity;
      const current = live();
      return !!identity && current?.activeDevices[identity.viewer] === identity.deviceId;
    },

    get invite() {
      return inviteForMe();
    },

    get choice() {
      if (!inTheWay) return null;
      return { existing: inTheWay, canJoin: inviteForMe()?.id === inTheWay.id };
    },

    get ended() {
      return ended;
    },

    start(title, episode) {
      send({ title, episode }, null);
    },

    join() {
      const invite = inviteForMe();
      if (!invite) return;
      inTheWay = null;
      ended = null;
      client.send({ type: "watchParty:join", partyId: invite.id });
      changed();
    },

    replace() {
      if (starting && inTheWay) send(starting, inTheWay.id);
    },

    dismissChoice() {
      inTheWay = null;
      changed();
    },

    cancel() {
      const current = live();
      if (current) client.send({ type: "watchParty:cancel", partyId: current.id });
    },

    dismissEnded() {
      ended = null;
      changed();
    },

    playerReady(partyId) {
      client.send({ type: "watchParty:player", partyId, status: "ready" });
    },

    playback(partyId, change) {
      client.send({ type: "watchParty:playback", partyId, change });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
