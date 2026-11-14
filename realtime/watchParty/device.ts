/**
 * The Watch Party, on a device: the shared state as last heard from the
 * server, the invite and choices it implies for this Viewer, and the intents
 * this device sends. Playing the Title is party sync's job (`./partySync.ts`),
 * on the one device that takes part.
 */
import type { Viewer } from "../../models/Viewer";
import type { DeviceId } from "../connection/protocol";
import type { DeviceClient } from "../deviceClient";
import type { TitleRef } from "../presence/protocol";
import type { Episode, WatchPartyEndReason, WatchPartyState } from "./protocol";

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
  /**
   * The Watch Party this Viewer takes part in from another device; null
   * otherwise. `join()` takes it over here.
   */
  readonly elsewhere: WatchPartyState | null;
  /**
   * "Continued on another device": this device took part in the Watch
   * Party until another device of this Viewer took it over.
   */
  readonly continuedElsewhere: boolean;
  /** The Watch Party waiting for this Viewer to join; null when there is none. */
  readonly invite: WatchPartyState | null;
  /** "Watch together" found another Watch Party: join it or replace it; null otherwise. */
  readonly choice: StartChoice | null;
  /** The other Viewer ended a Watch Party: what to tell this Viewer, until dismissed. */
  readonly ended: EndedNotice | null;
  /** "Watch together" on `title` (with `episode`, for a TV show). */
  start(title: TitleRef, episode: Episode | null): void;
  /**
   * Joins the invite (or the choice's Watch Party) from this device; or
   * takes over the Watch Party this Viewer takes part in from another device.
   */
  join(): void;
  /** Replaces the choice's Watch Party with the one this Viewer tried to start. */
  replace(): void;
  dismissChoice(): void;
  /** Ends the Watch Party for both Viewers ("Cancel" while it waits). */
  cancel(): void;
  dismissEnded(): void;
  /** Party sync: this device's player loaded Watch Party `partyId`'s Title. */
  playerReady(partyId: string): void;
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
  /** The Watch Party this device last took part in, and the device id it had then. */
  let tookPart: { partyId: string; deviceId: DeviceId } | null = null;

  function changed() {
    for (const listener of [...listeners]) listener();
  }

  function me() {
    return client.identity?.viewer ?? null;
  }

  function live() {
    return party && party.phase.name !== "ended" ? party : null;
  }

  /** The device this Viewer takes part in the Watch Party from; null when they don't. */
  function activeDevice() {
    const identity = client.identity;
    const current = live();
    return identity && current ? current.activeDevices[identity.viewer] : null;
  }

  function activeHere() {
    const active = activeDevice();
    return active !== null && active === client.identity?.deviceId;
  }

  function elsewhere() {
    const active = activeDevice();
    return active !== null && active !== client.identity?.deviceId ? live() : null;
  }

  /** Remembers the Watch Party this device takes part in, to tell when another device takes it over. */
  function rememberTakingPart() {
    const identity = client.identity;
    if (party && identity && activeHere()) tookPart = { partyId: party.id, deviceId: identity.deviceId };
  }

  function continuedElsewhere() {
    const current = elsewhere();
    return !!current && tookPart?.partyId === current.id && tookPart.deviceId === client.identity?.deviceId;
  }

  /** Moves the Watch Party this Viewer takes part in from another device to this one. */
  function takeOver(current: WatchPartyState) {
    inTheWay = null;
    ended = null;
    client.send({ type: "watchParty:takeOver", partyId: current.id });
    changed();
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
    rememberTakingPart();
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
      return activeHere();
    },

    get elsewhere() {
      return elsewhere();
    },

    get continuedElsewhere() {
      return continuedElsewhere();
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
      if (!invite) {
        const current = elsewhere();
        if (current) takeOver(current);
        return;
      }
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

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
