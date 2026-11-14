/**
 * The Watch Party, on a device: the shared state as last heard from the
 * server, the invite and choices it implies for this Viewer, and the intents
 * this device sends. Playing the Title is party sync's job (`./partySync.ts`),
 * on the one device that takes part.
 */
import type { Viewer } from "../../models/Viewer";
import type { SourceId } from "../../utils/sources";
import type { DeviceId } from "../connection/protocol";
import type { DeviceClient } from "../deviceClient";
import type { TitleRef } from "../presence/protocol";
import type { Episode, PlaybackChange, PositionMessage, WatchPartyEndReason, WatchPartyState } from "./protocol";

/**
 * How a Watch Party this device knew about ended, told to the Viewer who
 * did not end it (when the Title "finished", to both).
 */
export interface EndedNotice {
  title: TitleRef;
  episode: Episode | null;
  reason: WatchPartyEndReason;
  by: Viewer;
}

/** "Giorgi left": the other Viewer left the Watch Party of `title` (at `episode`). */
export interface LeftNotice {
  title: TitleRef;
  episode: Episode | null;
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
  /** Whether this device takes part in the Watch Party. */
  readonly activeHere: boolean;
  /**
   * The Watch Party whose player this device shows: the one it takes part
   * in, or the one the other Viewer left, which this Viewer keeps watching
   * alone until they stop. Null when it shows none.
   */
  readonly playerParty: WatchPartyState | null;
  /**
   * "Giorgi left · Keep watching alone / Stop": the other Viewer left the
   * Watch Party this device took part in. Until this Viewer chooses.
   */
  readonly left: LeftNotice | null;
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
  /**
   * "Watch together" on `title` (with `episode`, for a TV show). From the
   * device that takes part in a Watch Party: another episode of its TV show
   * moves both Viewers there (`changeEpisode`), and a different Title ends
   * it and invites the other Viewer to the new one, without asking first.
   */
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
  /**
   * Party sync: this device's player loaded Watch Party `partyId`'s Title
   * (`episode` of it, for a TV show) on `source`.
   */
  playerReady(partyId: string, episode: Episode | null, source: SourceId): void;
  /** Party sync: `source` could not play Watch Party `partyId`'s Title (`episode` of it) on this device. */
  playerFailed(partyId: string, episode: Episode | null, source: SourceId): void;
  /** Party sync: the Viewer changed playback in this device's player. */
  playback(partyId: string, change: PlaybackChange): void;
  /** Party sync: where this device's player is, to keep the players in step (`./drift.ts`). */
  reportPosition(report: Omit<PositionMessage, "type">): void;
  /**
   * Party sync: this device's player reached the end of the Title (of
   * `episode`, for a TV show) at `position`, and `next` comes after it
   * (null: nothing does).
   */
  titleEnded(partyId: string, episode: Episode | null, position: number, next: Episode | null): void;
  /**
   * Moves both Viewers to another `episode` of the Watch Party's TV show.
   * While the Watch Party still waits for the other Viewer, it starts anew
   * on that episode (a new invite) instead.
   */
  changeEpisode(episode: Episode): void;
  /** "Cancel" on "Next episode in 10s": both Viewers stay at the end of the episode. */
  cancelNextEpisode(): void;
  /**
   * The Viewer closed the Watch Party player: leaves the Watch Party, and
   * the other Viewer is asked whether to keep watching alone. While it still
   * waits for the other Viewer, this cancels it.
   */
  leave(): void;
  /** "Keep watching alone": the player stays open and plays on, for this Viewer only. */
  keepWatchingAlone(): void;
  /** "Stop" (or closing the player after the other Viewer left): closes the player. */
  stop(): void;
  /**
   * Moves both Viewers' players to another Syncable Source, at the current
   * position: the one the Watch Party's `fallback` offers, or any other.
   */
  switchSource(source: SourceId): void;
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
  /** The Watch Party this device last took part in. */
  let tookPartIn: string | null = null;
  /**
   * The connection this device had when it heard `party`: the id the shared
   * state knows it by. A new connection keeps the player going until the
   * state it brings says otherwise (a Device that reconnected or reloaded
   * takes part again from its new connection).
   */
  let heardOn: DeviceId | null = null;
  /** The Watch Party the other Viewer left, whose player this device keeps open until the Viewer stops. */
  let stayedIn: WatchPartyState | null = null;
  let left: LeftNotice | null = null;

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
    return active !== null && active === heardOn;
  }

  function elsewhere() {
    const active = activeDevice();
    return active !== null && active !== heardOn ? live() : null;
  }

  /** Remembers the Watch Party this device takes part in, to tell when another device takes it over. */
  function rememberTakingPart() {
    if (party && activeHere()) tookPartIn = party.id;
  }

  function continuedElsewhere() {
    const current = elsewhere();
    return !!current && tookPartIn === current.id;
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

  function changeEpisode(episode: Episode) {
    const current = live();
    if (!current?.episode || !activeHere()) return;
    if (current.episode.season === episode.season && current.episode.episode === episode.episode) return;
    if (current.phase.name === "inviting") send({ title: current.title, episode }, current.id);
    else client.send({ type: "watchParty:episode", partyId: current.id, episode });
  }

  /**
   * The newest shared state's `seq` heard on this connection. A state that
   * arrives after a newer one is stale and ignored. A new connection may
   * reach a restarted server, which numbers from scratch: it starts over.
   */
  let newestSeq = -1;
  client.on("welcome", () => {
    newestSeq = -1;
  });

  client.on("watchParty", (message) => {
    if (message.party) {
      if (message.party.seq <= newestSeq) return;
      newestSeq = message.party.seq;
    }
    party = message.party;
    heardOn = client.identity?.deviceId ?? null;
    rememberTakingPart();
    const phase = party?.phase;
    const viewer = me();
    // The other Viewer left the Watch Party this device takes part in: its player stays, and the Viewer chooses.
    const leftHere =
      phase?.name === "ended" &&
      phase.reason === "left" &&
      viewer !== null &&
      phase.by !== viewer &&
      party?.activeDevices[viewer] === heardOn;
    if (party && phase?.name === "ended" && leftHere) {
      stayedIn = party;
      left = { title: party.title, episode: party.episode, by: phase.by };
    } else if (party && phase?.name === "ended" && (phase.by !== viewer || phase.reason === "finished")) {
      ended = { title: party.title, episode: party.episode, reason: phase.reason, by: phase.by };
    }
    // Taking part in another Watch Party replaces the player kept open alone.
    if (activeHere()) {
      stayedIn = null;
      left = null;
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

    get playerParty() {
      return activeHere() ? live() : stayedIn;
    },

    get left() {
      return left;
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
      const current = live();
      if (!current || !activeHere()) {
        send({ title, episode }, null);
        return;
      }
      // From the device that takes part: another episode moves both Viewers to it,
      // while a different Title ends this Watch Party and invites the other Viewer anew.
      const sameTitle = current.title.tmdbId === title.tmdbId && current.title.contentType === title.contentType;
      if (!sameTitle) send({ title, episode }, current.id);
      else if (episode) changeEpisode(episode);
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

    playerReady(partyId, episode, source) {
      client.send({ type: "watchParty:player", partyId, status: "ready", episode, source });
    },

    playerFailed(partyId, episode, source) {
      client.send({ type: "watchParty:player", partyId, status: "failed", episode, source });
    },

    playback(partyId, change) {
      client.send({ type: "watchParty:playback", partyId, change });
    },

    reportPosition(report) {
      client.send({ type: "watchParty:position", ...report });
    },

    titleEnded(partyId, episode, position, next) {
      client.send({ type: "watchParty:ended", partyId, episode, position, next });
    },

    changeEpisode,

    cancelNextEpisode() {
      const current = live();
      if (current?.phase.name === "next-episode" && activeHere()) {
        client.send({ type: "watchParty:cancelNext", partyId: current.id });
      }
    },

    leave() {
      const current = live();
      if (current && activeHere()) client.send({ type: "watchParty:leave", partyId: current.id });
    },

    keepWatchingAlone() {
      left = null;
      changed();
    },

    stop() {
      left = null;
      stayedIn = null;
      changed();
    },

    switchSource(source) {
      const current = live();
      if (!current || !activeHere() || current.source === source) return;
      client.send({ type: "watchParty:source", partyId: current.id, source });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
