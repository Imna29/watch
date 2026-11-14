/**
 * Party sync: on the one device of a Viewer that takes part in the Watch
 * Party, joins a Syncable Source adapter to the realtime connection.
 * Framework-free; `composables/useWatchParty.ts` wraps it for Vue, and the
 * seam 1 harness drives it with a fake Source player.
 *
 * It loads the Watch Party's Title in its Source, tells the coordinator when
 * the player is ready, keeps the player where the shared state's anchor says
 * it should be, and exposes what the player shell shows over the player
 * (`PartySyncView`).
 */
import { otherViewer, type Viewer } from "../../models/Viewer";
import type { Playable } from "../../utils/sources";
import type { Clock, TimerId } from "../clock";
import type { DeviceClient } from "../deviceClient";
import type { DeviceWatchParty } from "./device";
import type { PlaybackAnchor, WatchPartyState } from "./protocol";
import type { PlayerEvent, PlayerFrame, SyncableSourceAdapter } from "./sources/adapter";
import { hasAdapter, SYNCABLE_SOURCE_ADAPTERS } from "./sources";

/** A player this close to where it should be is left alone; further off, it is moved. */
const SEEK_TOLERANCE_S = 0.5;

export interface PartySyncView {
  /** The Source's player: loading the Title, ready, or failed to load it. */
  player: "loading" | "ready" | "failed";
  /** "Waiting for Mariam…": the Viewer the Watch Party waits for; null when it waits for nobody. */
  waitingFor: Viewer | null;
  /** 3, 2, 1 before both players start; null otherwise. */
  countdown: number | null;
  /** Both Viewers are in, but a player is still loading: the countdown has not begun. */
  gettingReady: boolean;
}

export interface PartySync {
  readonly view: PartySyncView;
  /** Calls `listener` after every change of `view`. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Stops controlling the player; the caller then removes it. */
  destroy(): void;
}

export interface PartySyncOptions {
  watchParty: DeviceWatchParty;
  /** For the server's clock, which the shared state's times are on. */
  client: DeviceClient;
  /** This device's clock. */
  clock: Clock;
  /** The iframe the Source's player runs in. */
  frame: PlayerFrame;
  /** Passed to the adapter: how long a Source may take to load. */
  readyTimeoutMs?: number;
}

export function playableOf(party: Pick<WatchPartyState, "title" | "episode">): Playable {
  return party.episode
    ? { kind: "episode", tmdbId: party.title.tmdbId, ...party.episode }
    : { kind: "movie", tmdbId: party.title.tmdbId };
}

/** Where `anchor` says the player should be at `serverTime`. */
export function anchorAt(anchor: PlaybackAnchor, serverTime: number) {
  const playing = anchor.playing && serverTime >= anchor.serverTime;
  const elapsed = playing ? ((serverTime - anchor.serverTime) / 1000) * anchor.rate : 0;
  return { playing, position: anchor.position + elapsed };
}

export function createPartySync({ watchParty, client, clock, frame, readyTimeoutMs }: PartySyncOptions): PartySync {
  const listeners = new Set<() => void>();
  let adapter: SyncableSourceAdapter | null = null;
  let view: PartySyncView = { player: "loading", waitingFor: null, countdown: null, gettingReady: false };
  /**
   * The player as last heard from it (or as last told: commands count as
   * done until the player says otherwise). `position` is at `at`, on this
   * device's clock.
   */
  const player = { paused: true, position: 0, at: clock.now(), rate: 1 };
  let countdownTimer: TimerId | null = null;
  /** The Watch Party this device last said its player is ready for. */
  let reportedReadyFor: string | null = null;
  let destroyed = false;

  function setView(next: Partial<PartySyncView>) {
    const changed = (Object.keys(next) as (keyof PartySyncView)[]).some((key) => next[key] !== view[key]);
    if (!changed) return;
    view = { ...view, ...next };
    for (const listener of [...listeners]) listener();
  }

  function live() {
    const party = watchParty.party;
    return party && party.phase.name !== "ended" ? party : null;
  }

  function playerPosition() {
    return player.paused ? player.position : player.position + ((clock.now() - player.at) / 1000) * player.rate;
  }

  function playerIsAt(position: number) {
    player.position = position;
    player.at = clock.now();
  }

  /** Moves the player to where the shared state says it should be now. */
  function apply() {
    const party = live();
    if (!adapter || view.player !== "ready" || !party) return;
    const wanted = anchorAt(party.anchor, client.serverNow());
    if (Math.abs(playerPosition() - wanted.position) > SEEK_TOLERANCE_S) {
      adapter.seek(wanted.position);
      playerIsAt(wanted.position);
    }
    if (wanted.playing && player.paused) {
      adapter.play();
      playerIsAt(playerPosition());
      player.paused = false;
    } else if (!wanted.playing && !player.paused) {
      adapter.pause();
      playerIsAt(playerPosition());
      player.paused = true;
    }
  }

  function heard(event: PlayerEvent) {
    switch (event.type) {
      case "ready":
        setView({ player: "ready" });
        reportReady();
        adapter?.requestStatus();
        return apply();
      case "status":
        playerIsAt(event.position);
        player.paused = event.paused;
        return apply();
      case "play":
      case "pause":
        playerIsAt(playerPosition());
        player.paused = event.type === "pause";
        return apply();
      case "seeked":
      case "timeupdate":
        playerIsAt(event.position);
        return;
      case "ratechange":
        playerIsAt(playerPosition());
        player.rate = event.rate;
        return;
      case "error":
        if (event.reason === "not-ready") setView({ player: "failed" });
        return;
    }
  }

  function load(party: WatchPartyState) {
    if (!hasAdapter(party.source)) {
      setView({ player: "failed" });
      return;
    }
    adapter = SYNCABLE_SOURCE_ADAPTERS[party.source]({ frame, clock, readyTimeoutMs });
    adapter.on(heard);
    adapter.load(playableOf(party), anchorAt(party.anchor, client.serverNow()).position);
  }

  function reportReady() {
    const party = live();
    if (!party || view.player !== "ready" || reportedReadyFor === party.id) return;
    reportedReadyFor = party.id;
    watchParty.playerReady(party.id);
  }

  /** Shows 3, 2, 1 until the countdown's end, on the server's clock. */
  function countDown() {
    if (countdownTimer !== null) clock.clearTimeout(countdownTimer);
    countdownTimer = null;
    const phase = live()?.phase;
    const endsAt = phase?.name === "countdown" ? phase.endsAt : null;
    const remaining = endsAt === null ? 0 : endsAt - client.serverNow();
    if (remaining < 1) {
      setView({ countdown: null });
      return apply();
    }
    const secondsLeft = Math.ceil(remaining / 1000);
    setView({ countdown: secondsLeft });
    countdownTimer = clock.setTimeout(countDown, remaining - (secondsLeft - 1) * 1000);
  }

  function followParty() {
    const party = live();
    if (destroyed || !party) return;
    setView({
      waitingFor: party.phase.name === "inviting" ? otherViewer(party.starter) : null,
      gettingReady: party.phase.name === "countdown" && party.phase.endsAt === null,
    });
    reportReady();
    countDown();
  }

  const party = live();
  if (party) load(party);
  followParty();
  const stopFollowing = watchParty.subscribe(followParty);

  return {
    get view() {
      return view;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    destroy() {
      destroyed = true;
      stopFollowing();
      if (countdownTimer !== null) clock.clearTimeout(countdownTimer);
      adapter?.destroy();
      adapter = null;
      listeners.clear();
    },
  };
}
