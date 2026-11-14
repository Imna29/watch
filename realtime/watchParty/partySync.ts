/**
 * Party sync: on the one device of a Viewer that takes part in the Watch
 * Party, joins a Syncable Source adapter to the realtime connection.
 * Framework-free; `composables/useWatchParty.ts` wraps it for Vue, and the
 * seam 1 harness drives it with a fake Source player.
 *
 * It loads the Watch Party's Title (or episode) in its Source, tells the
 * coordinator when the player is ready, keeps the player where the shared
 * state's anchor says it should be, sends the Viewer's own play, pause, seek
 * and speed changes on as intents (never the echoes of its own commands),
 * and exposes what the player shell shows over the player (`PartySyncView`).
 */
import { otherViewer, type Viewer } from "../../models/Viewer";
import type { Playable } from "../../utils/sources";
import type { Clock, TimerId } from "../clock";
import type { DeviceClient } from "../deviceClient";
import type { DeviceWatchParty } from "./device";
import {
  takesPlaybackChanges,
  type Episode,
  type PlaybackAnchor,
  type WatchPartyChange,
  type WatchPartyState,
} from "./protocol";
import type { PlayerEvent, PlayerFrame, SyncableSourceAdapter } from "./sources/adapter";
import { hasAdapter, SYNCABLE_SOURCE_ADAPTERS } from "./sources";

/** A player this close to where it should be is left alone; further off, it is moved. */
const SEEK_TOLERANCE_S = 0.5;

/** How long the other Viewer's change message stays. */
const CHANGE_MESSAGE_MS = 5000;

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
   * (`describeChange` in `./changeMessage.ts` words it); null otherwise.
   */
  lastChange: WatchPartyChange | null;
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

/** How long a player may take to report a command; after that, the command is taken to have done nothing. */
const ECHO_TIMEOUT_MS = 10_000;

/** What the player reports when it carries out one of party sync's commands. */
type Echo =
  | { type: "play" | "pause" }
  | { type: "seeked"; position: number }
  | { type: "ratechange"; rate: number };

/** Commands that report on the same thing: a later one decides it. */
function channelOf(type: Echo["type"]) {
  return type === "play" || type === "pause" ? "playing" : type;
}

/**
 * Echo suppression. A Source's player reports the commands party sync gives
 * it ("play", "pause", "seeked", "ratechange") exactly as it reports the
 * Viewer's own presses, so party sync notes what each command will report.
 * A report that matches is an echo, never sent on as the Viewer's change.
 */
function createEchoes(clock: Clock) {
  let expected: (Echo & { until: number })[] = [];

  function matches(echo: Echo, event: PlayerEvent) {
    if (echo.type !== event.type) return false;
    if (echo.type === "seeked" && event.type === "seeked") {
      return Math.abs(echo.position - event.position) <= SEEK_TOLERANCE_S;
    }
    if (echo.type === "ratechange" && event.type === "ratechange") return echo.rate === event.rate;
    return true;
  }

  return {
    expect(echo: Echo) {
      expected.push({ ...echo, until: clock.now() + ECHO_TIMEOUT_MS });
    },

    /**
     * Whether `event` echoes a command; null when it does not. The player
     * reports in order, so commands on the same thing given before that one
     * will not be reported any more: they are forgotten too. `latest`: no
     * later command on the same thing is still on its way.
     */
    heard(event: PlayerEvent): { latest: boolean } | null {
      const now = clock.now();
      expected = expected.filter((echo) => echo.until > now);
      const index = expected.findIndex((echo) => matches(echo, event));
      if (index === -1) return null;
      const channel = channelOf(expected[index]!.type);
      expected = expected.filter((echo, i) => i > index || channelOf(echo.type) !== channel);
      return { latest: !expected.some((echo) => channelOf(echo.type) === channel) };
    },

    clear() {
      expected = [];
    },
  };
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
  let view: PartySyncView = {
    player: "loading",
    waitingFor: null,
    countdown: null,
    gettingReady: false,
    lastChange: null,
  };
  /**
   * The player as last heard from it (or as last told: commands count as
   * done until the player says otherwise). `position` is at `at`, on this
   * device's clock.
   */
  const player = { paused: true, position: 0, at: clock.now(), rate: 1 };
  const echoes = createEchoes(clock);
  let countdownTimer: TimerId | null = null;
  /** What the frame has loaded: the Source and what it plays (see `load`). */
  let loaded: string | null = null;
  let loadedEpisode: Episode | null = null;
  /** The Watch Party this device last said its player is ready for. */
  let reportedReadyFor: string | null = null;
  /** The shared state last looked at for a change message, by `seq`. */
  let seenSeq: number | null = null;
  let changeTimer: TimerId | null = null;
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
      echoes.expect({ type: "seeked", position: wanted.position });
      playerIsAt(wanted.position);
    }
    if (wanted.playing && player.paused) {
      adapter.play();
      echoes.expect({ type: "play" });
      playerIsAt(playerPosition());
      player.paused = false;
    } else if (!wanted.playing && !player.paused) {
      adapter.pause();
      echoes.expect({ type: "pause" });
      playerIsAt(playerPosition());
      player.paused = true;
    }
    // On a Source that cannot change speed, the player stays at its own.
    if (adapter.canSetRate && player.rate !== party.anchor.rate) {
      adapter.setRate(party.anchor.rate);
      echoes.expect({ type: "ratechange", rate: party.anchor.rate });
      playerIsAt(playerPosition());
      player.rate = party.anchor.rate;
    }
  }

  function heard(event: PlayerEvent) {
    switch (event.type) {
      case "ready":
        setView({ player: "ready" });
        reportReady();
        // The embed URL told the player to autoplay: its "play" is that command's echo.
        echoes.expect({ type: "play" });
        adapter?.requestStatus();
        return apply();
      case "status":
        playerIsAt(event.position);
        player.paused = event.paused;
        return apply();
      case "play":
      case "pause":
      case "ratechange":
        return heardPlayback(event);
      case "seeked": {
        playerIsAt(event.position);
        if (echoes.heard(event)) return;
        if (!sentAsViewerChange(event)) apply();
        return;
      }
      case "timeupdate":
        playerIsAt(event.position);
        return;
      case "error":
        if (event.reason === "not-ready") setView({ player: "failed" });
        return;
    }
  }

  /**
   * The player started, paused or changed speed: because party sync told it
   * to (an echo), or because the Viewer did it in the Source's controls.
   */
  function heardPlayback(event: Extract<PlayerEvent, { type: "play" | "pause" | "ratechange" }>) {
    playerIsAt(playerPosition());
    const before = { paused: player.paused, rate: player.rate };
    const echo = echoes.heard(event);
    // An echo of an older command leaves the player as the newer ones (still on their way) will have it.
    if (!echo || echo.latest) {
      if (event.type === "ratechange") player.rate = event.rate;
      else player.paused = event.type === "pause";
    }
    const changed = player.paused !== before.paused || player.rate !== before.rate;
    if (!echo && changed && sentAsViewerChange(event)) return;
    apply();
  }

  /**
   * Shared controls: when `event` is the Viewer's own change in the Source's
   * controls (it is no echo, and it changed the player), sends it to the
   * coordinator and returns true. The player then stays where the Viewer put
   * it; the new shared state follows. Outside playing and paused, nothing
   * is sent: the player follows the shared state.
   */
  function sentAsViewerChange(event: PlayerEvent): boolean {
    const party = live();
    if (!party || view.player !== "ready" || !takesPlaybackChanges(party.phase)) return false;
    switch (event.type) {
      case "play":
      case "pause":
        watchParty.playback(party.id, { kind: event.type, position: playerPosition() });
        return true;
      case "seeked": {
        const wanted = anchorAt(party.anchor, client.serverNow());
        if (Math.abs(event.position - wanted.position) <= SEEK_TOLERANCE_S) return false;
        watchParty.playback(party.id, { kind: "seek", position: event.position });
        return true;
      }
      case "ratechange":
        if (!adapter?.canSetRate) return false;
        watchParty.playback(party.id, { kind: "rate", position: playerPosition(), rate: event.rate });
        return true;
      default:
        return false;
    }
  }

  /**
   * Loads what the Watch Party plays (its Title or episode, on its Source)
   * unless the player already has it: at first, and again whenever a Viewer
   * chooses another episode. The new document starts paused where the
   * shared state is, at normal speed, with no commands on their way.
   */
  function load(party: WatchPartyState) {
    const playable = playableOf(party);
    const key = JSON.stringify([party.source, playable]);
    if (key === loaded) return;
    loaded = key;
    loadedEpisode = party.episode;
    echoes.clear();
    reportedReadyFor = null;
    const startAt = anchorAt(party.anchor, client.serverNow()).position;
    Object.assign(player, { paused: true, position: startAt, at: clock.now(), rate: 1 });
    if (adapter?.source.id !== party.source) {
      adapter?.destroy();
      adapter = null;
      if (!hasAdapter(party.source)) {
        setView({ player: "failed" });
        return;
      }
      adapter = SYNCABLE_SOURCE_ADAPTERS[party.source]({ frame, clock, readyTimeoutMs });
      adapter.on(heard);
    }
    setView({ player: "loading" });
    adapter.load(playable, startAt);
  }

  function reportReady() {
    const party = live();
    if (!party || view.player !== "ready" || reportedReadyFor === party.id) return;
    reportedReadyFor = party.id;
    watchParty.playerReady(party.id, loadedEpisode);
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

  /**
   * "Mariam paused at 1:02:14": shows the other Viewer's change for a few
   * seconds, once, when the state that made it arrives.
   */
  function tellChange(party: WatchPartyState) {
    if (party.seq === seenSeq) return;
    seenSeq = party.seq;
    const change = party.lastChange;
    if (!change || change.seq !== party.seq || change.by === client.identity?.viewer) return;
    if (changeTimer !== null) clock.clearTimeout(changeTimer);
    setView({ lastChange: change });
    changeTimer = clock.setTimeout(() => {
      changeTimer = null;
      setView({ lastChange: null });
    }, CHANGE_MESSAGE_MS);
  }

  function followParty() {
    const party = live();
    if (destroyed || !party) return;
    load(party);
    setView({
      waitingFor: party.phase.name === "inviting" ? otherViewer(party.starter) : null,
      gettingReady: party.phase.name === "countdown" && party.phase.endsAt === null,
    });
    tellChange(party);
    reportReady();
    countDown();
  }

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
      if (changeTimer !== null) clock.clearTimeout(changeTimer);
      adapter?.destroy();
      adapter = null;
      listeners.clear();
    },
  };
}
