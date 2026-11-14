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
import { POSITION_REPORT_MS } from "./drift";
import {
  anchorAt,
  takesPlaybackChanges,
  type Episode,
  type WatchPartyChange,
  type WatchPartyState,
} from "./protocol";
import type { PlayerEvent, PlayerFrame, SyncableSourceAdapter } from "./sources/adapter";
import { hasAdapter, SYNCABLE_SOURCE_ADAPTERS } from "./sources";

/** A player this close to where it should be is left alone; further off, it is moved. */
const SEEK_TOLERANCE_S = 0.5;

/** How long the other Viewer's change message stays. */
const CHANGE_MESSAGE_MS = 5000;

/**
 * A playing player tells its time at least about once a second. One that has
 * said nothing for this long has stalled.
 */
const STALL_MS = 2000;

/** A player that fell behind plays on until it is this close to where the Watch Party waits for it. */
const CAUGHT_UP_S = 0.1;

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

    /** Whether a command that reports `type` is still on its way. */
    awaiting(type: Echo["type"]) {
      const now = clock.now();
      return expected.some((echo) => echo.type === type && echo.until > now);
    },

    clear() {
      expected = [];
    },
  };
}

export { anchorAt };

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
   * device's clock. A `stalled` player stands still although not paused.
   */
  const player = { paused: true, position: 0, at: clock.now(), rate: 1, stalled: false };
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
  let reportTimer: TimerId | null = null;
  let startTimer: TimerId | null = null;
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
    if (player.paused || player.stalled) return player.position;
    return player.position + ((clock.now() - player.at) / 1000) * player.rate;
  }

  function playerIsAt(position: number) {
    player.position = position;
    player.at = clock.now();
    player.stalled = false;
  }

  /** Whether the Watch Party waits for this device's Viewer to catch up. */
  function waitingForMe(party: WatchPartyState) {
    return party.phase.name === "waiting" && party.phase.viewer === client.identity?.viewer;
  }

  /**
   * Where the player should be now: where the shared state is. While the
   * Watch Party waits for this Viewer, a player that fell behind plays on up
   * to where the others wait, instead of jumping there: nobody misses anything.
   */
  function wantedNow(party: WatchPartyState) {
    const wanted = anchorAt(party.anchor, client.serverNow());
    const behind = waitingForMe(party) && playerPosition() < wanted.position - CAUGHT_UP_S;
    return behind ? { playing: true, position: playerPosition() } : wanted;
  }

  /** Moves the player to where the shared state is now (also when the coordinator says it drifted). */
  function seekToParty(party: WatchPartyState) {
    if (!adapter) return;
    const position = anchorAt(party.anchor, client.serverNow()).position;
    adapter.seek(position);
    echoes.expect({ type: "seeked", position });
    playerIsAt(position);
  }

  /**
   * Tells the coordinator where the player is, so it can keep the players in
   * step (`./drift.ts`). Not while a seek is on its way: the player is not
   * where it is going yet.
   */
  function reportPosition() {
    reportTimer = clock.setTimeout(reportPosition, POSITION_REPORT_MS);
    const party = live();
    if (!party || view.player !== "ready" || echoes.awaiting("seeked")) return;
    if (!player.paused && !player.stalled && clock.now() - player.at > STALL_MS) player.stalled = true;
    watchParty.reportPosition({
      partyId: party.id,
      seq: party.seq,
      position: playerPosition(),
      serverTime: client.serverNow(),
      stalled: player.stalled,
    });
  }

  /** Moves the player to where the shared state says it should be now. */
  function apply() {
    const party = live();
    if (!adapter || view.player !== "ready" || !party) return;
    const wanted = wantedNow(party);
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
      case "timeupdate": {
        playerIsAt(event.position);
        // Catching up: stop where the Watch Party waits.
        const party = live();
        if (party && waitingForMe(party)) apply();
        return;
      }
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
      waitingFor: waitingFor(party),
      gettingReady: party.phase.name === "countdown" && party.phase.endsAt === null,
    });
    tellChange(party);
    reportReady();
    countDown();
    startOnTime(party);
  }

  /** "Waiting for Mariam…": for the other Viewer to join, or for a Viewer to catch up or come back. */
  function waitingFor({ phase, starter }: WatchPartyState) {
    if (phase.name === "inviting") return otherViewer(starter);
    return phase.name === "waiting" ? phase.viewer : null;
  }

  /** Starts the player at the moment the shared state says, so every player starts at once. */
  function startOnTime(party: WatchPartyState) {
    if (startTimer !== null) clock.clearTimeout(startTimer);
    startTimer = null;
    const wait = party.anchor.serverTime - client.serverNow();
    if (!party.anchor.playing || wait <= 0) return;
    startTimer = clock.setTimeout(() => {
      startTimer = null;
      apply();
    }, wait);
  }

  followParty();
  const stopFollowing = watchParty.subscribe(followParty);
  reportTimer = clock.setTimeout(reportPosition, POSITION_REPORT_MS);
  // The coordinator saw the player drift from the shared state it reported on: move it there.
  const stopCatchingUp = client.on("watchParty:catchUp", ({ partyId, seq }) => {
    const party = live();
    if (destroyed || view.player !== "ready" || party?.id !== partyId || party.seq !== seq) return;
    seekToParty(party);
  });

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
      stopCatchingUp();
      if (reportTimer !== null) clock.clearTimeout(reportTimer);
      if (startTimer !== null) clock.clearTimeout(startTimer);
      if (countdownTimer !== null) clock.clearTimeout(countdownTimer);
      if (changeTimer !== null) clock.clearTimeout(changeTimer);
      adapter?.destroy();
      adapter = null;
      listeners.clear();
    },
  };
}
