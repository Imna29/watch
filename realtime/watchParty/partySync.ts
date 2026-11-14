/**
 * Party sync: on the one device of a Viewer that takes part in the Watch
 * Party, joins a Syncable Source adapter to the realtime connection.
 * Framework-free; `composables/useWatchParty.ts` wraps it for Vue, and the
 * seam 1 harness drives it with a fake Source player.
 *
 * It loads the Watch Party's Title (or episode) in its Source, tells the
 * coordinator when the player is ready (or the Source failed), keeps the
 * player where the shared state's anchor says it should be, sends the
 * Viewer's own play, pause, seek
 * and speed changes on as intents (never the echoes of its own commands),
 * and exposes what the player shell shows over the player (`PartySyncView`).
 */
import { otherViewer, type Viewer } from "../../models/Viewer";
import type { Playable, SourceId } from "../../utils/sources";
import type { Clock, TimerId } from "../clock";
import type { DeviceClient } from "../deviceClient";
import type { DeviceWatchParty } from "./device";
import { POSITION_REPORT_MS } from "./drift";
import { episodeAfter, type EpisodeGuide } from "./episodeGuide";
import {
  anchorAt,
  takesPlaybackChanges,
  type Episode,
  type WatchPartyChange,
  type WatchPartyState,
} from "./protocol";
import { sourceFailed, type PlayerEvent, type PlayerFrame, type SyncableSourceAdapter } from "./sources/adapter";
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

/** A player says "play" at once when it starts; one still silent this long after a play command did not start. */
const PLAY_REFUSED_MS = 2000;

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
  /** "Next episode in 10s · Cancel": the episode both move to, and the seconds left; null otherwise. */
  nextEpisode: { episode: Episode; secondsLeft: number } | null;
  /**
   * "Click to resume": the browser would not start the player (after a page
   * reload it may refuse until the Viewer clicks in the page). The Watch
   * Party waits for this Viewer meanwhile. The button calls `resume()`.
   */
  clickToResume: boolean;
}

export interface PartySync {
  readonly view: PartySyncView;
  /** Calls `listener` after every change of `view`. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
  /** "Click to resume" was clicked: the player may start now. Call it from the click itself. */
  resume(): void;
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
  /** Where the episode after the one that ended is looked up. */
  episodes: EpisodeGuide;
}

export function playableOf(party: Pick<WatchPartyState, "title" | "episode">): Playable {
  return party.episode
    ? { kind: "episode", tmdbId: party.title.tmdbId, ...party.episode }
    : { kind: "movie", tmdbId: party.title.tmdbId };
}

/** How long a player may take to report a command; after that, the command is taken to have done nothing. */
const ECHO_TIMEOUT_MS = 10_000;

/** The most a seek is taken to last when aiming ahead by it (see `seekLagS`). */
const MAX_SEEK_LAG_S = 5;

/**
 * What the player reports when it carries out one of party sync's commands.
 * `followUp`: a seek meant to land in step with a playing Watch Party, which
 * is made once more if it took so long that it landed behind.
 */
type Echo =
  | { type: "play" | "pause" }
  | { type: "seeked"; position: number; followUp: boolean }
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
  let expected: (Echo & { at: number; until: number })[] = [];

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
      const now = clock.now();
      expected.push({ ...echo, at: now, until: now + ECHO_TIMEOUT_MS });
    },

    /**
     * The command `event` echoes; null when it echoes none. The player
     * reports in order, so commands on the same thing given before that one
     * will not be reported any more: they are forgotten too. `latest`: no
     * later command on the same thing is still on its way. `tookMs`: how
     * long the player took to carry it out.
     */
    heard(event: PlayerEvent): { echo: Echo; latest: boolean; tookMs: number } | null {
      const now = clock.now();
      expected = expected.filter((echo) => echo.until > now);
      const index = expected.findIndex((echo) => matches(echo, event));
      if (index === -1) return null;
      const echo = expected[index]!;
      const channel = channelOf(echo.type);
      expected = expected.filter((other, i) => i > index || channelOf(other.type) !== channel);
      return { echo, latest: !expected.some((other) => channelOf(other.type) === channel), tookMs: now - echo.at };
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

export function createPartySync({
  watchParty,
  client,
  clock,
  frame,
  readyTimeoutMs,
  episodes,
}: PartySyncOptions): PartySync {
  const listeners = new Set<() => void>();
  let adapter: SyncableSourceAdapter | null = null;
  let view: PartySyncView = {
    player: "loading",
    waitingFor: null,
    countdown: null,
    gettingReady: false,
    lastChange: null,
    nextEpisode: null,
    clickToResume: false,
  };
  /**
   * The player as last heard from it (or as last told: commands count as
   * done until the player says otherwise). `position` is at `at`, on this
   * device's clock. A `stalled` player stands still although not paused.
   */
  const player = { paused: true, position: 0, at: clock.now(), rate: 1, stalled: false };
  const echoes = createEchoes(clock);
  /** How long this player's last seek took to carry out, in seconds: seeks aim that far ahead (`seekTo`). */
  let seekLagS = 0;
  let countdownTimer: TimerId | null = null;
  /** What the frame has loaded: the Source and what it plays (see `load`). */
  let loaded: string | null = null;
  let loadedEpisode: Episode | null = null;
  let loadedSource: SourceId | null = null;
  /** What this device last told the coordinator about its player, and on which connection (see `reportPlayer`). */
  let reported: { partyId: string; player: "ready" | "failed"; on: string | null } | null = null;
  /** The shared state last looked at for a change message, by `seq`. */
  let seenSeq: number | null = null;
  let changeTimer: TimerId | null = null;
  let reportTimer: TimerId | null = null;
  let startTimer: TimerId | null = null;
  /** While a play command waits for the player's "play": the timer that gives up on it. */
  let playTimer: TimerId | null = null;
  /** The loaded Title's length, once the player reported it. */
  let duration: number | null = null;
  /**
   * The player stopped at the end of what it plays. It stays there (nothing
   * to play, no drift to report) until the shared state wants it earlier on.
   */
  let stoppedAtTheEnd = false;
  let nextEpisodeTimer: TimerId | null = null;
  let destroyed = false;

  function setView(next: Partial<PartySyncView>) {
    const changed = (Object.keys(next) as (keyof PartySyncView)[]).some((key) => next[key] !== view[key]);
    if (!changed) return;
    view = { ...view, ...next };
    for (const listener of [...listeners]) listener();
  }

  /**
   * The Watch Party this player is for: the one there is as it opens. Once
   * that one ends, the player is no longer synced (the other Viewer left:
   * this Viewer may keep watching alone), whatever Watch Party comes next.
   */
  const partyId = watchParty.party?.id ?? null;

  function live() {
    const party = watchParty.party;
    return party && party.id === partyId && party.phase.name !== "ended" ? party : null;
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

  /**
   * Whether a player that stopped at the end stays there, when the shared
   * state wants it at `position`: the shared state goes on past the end until
   * the coordinator hears it ended.
   */
  function staysAtTheEnd(position: number) {
    if (stoppedAtTheEnd && duration !== null && position < duration - END_TOLERANCE_S) stoppedAtTheEnd = false;
    return stoppedAtTheEnd;
  }

  /**
   * Seeks the player to `wanted.position`, where the shared state is now.
   * While that plays on (at `rate`), the player stands still for as long as
   * the seek takes, so it aims that much further ahead, by the last seek's
   * time (`seekLagS`). A `followUp` seek that still lands behind is made
   * once more (`landInStep`).
   */
  function seekTo(wanted: { position: number; playing: boolean }, rate: number, followUp = true) {
    if (!adapter) return;
    const position = wanted.playing ? wanted.position + seekLagS * rate : wanted.position;
    adapter.seek(position);
    echoes.expect({ type: "seeked", position, followUp: followUp && wanted.playing });
    playerIsAt(position);
  }

  /**
   * After a seek that took longer than `seekLagS` said: one that landed
   * behind a playing Watch Party seeks again, aiming as far ahead as this
   * one took. Never back: a player that landed ahead stays there.
   */
  function landInStep() {
    const party = live();
    if (!party || view.player !== "ready") return;
    const wanted = wantedNow(party);
    if (wanted.playing && playerPosition() < wanted.position - SEEK_TOLERANCE_S) seekTo(wanted, party.anchor.rate, false);
  }

  /** Moves the player to where the shared state is now (also when the coordinator says it drifted). */
  function seekToParty(party: WatchPartyState) {
    const wanted = anchorAt(party.anchor, client.serverNow());
    if (staysAtTheEnd(wanted.position)) return;
    seekTo(wanted, party.anchor.rate);
  }

  /**
   * Tells the coordinator where the player is, so it can keep the players in
   * step (`./drift.ts`). Not while a seek is on its way: the player is not
   * where it is going yet.
   */
  function reportPosition() {
    reportTimer = clock.setTimeout(reportPosition, POSITION_REPORT_MS);
    const party = live();
    if (!party || view.player !== "ready" || stoppedAtTheEnd || echoes.awaiting("seeked")) return;
    if (!player.paused && !player.stalled && clock.now() - player.at > STALL_MS) player.stalled = true;
    watchParty.reportPosition({
      partyId: party.id,
      seq: party.seq,
      position: playerPosition(),
      serverTime: client.serverNow(),
      stalled: player.stalled || view.clickToResume,
    });
  }

  /** Moves the player to where the shared state says it should be now. */
  function apply() {
    const party = live();
    if (!adapter || view.player !== "ready" || !party) return;
    const wanted = wantedNow(party);
    if (staysAtTheEnd(wanted.position)) return;
    if (Math.abs(playerPosition() - wanted.position) > SEEK_TOLERANCE_S) seekTo(wanted, party.anchor.rate);
    if (wanted.playing && player.paused && !view.clickToResume) {
      adapter.play();
      echoes.expect({ type: "play" });
      playerIsAt(playerPosition());
      player.paused = false;
      expectPlayToStart();
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
    // The player moved to another episode by itself: nothing it says counts until it loads anew.
    if (loaded === null) return;
    switch (event.type) {
      case "episode":
        return heardEpisode(event);
      case "ready":
        setView({ player: "ready" });
        reportPlayer();
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
        const heard = echoes.heard(event);
        if (heard) {
          seekLagS = Math.min(MAX_SEEK_LAG_S, heard.tookMs / 1000);
          if (heard.latest && heard.echo.type === "seeked" && heard.echo.followUp) landInStep();
          return;
        }
        if (!sentAsViewerChange(event)) apply();
        return;
      }
      case "timeupdate": {
        playerIsAt(event.position);
        if (event.duration !== undefined) duration = event.duration;
        // Catching up: stop where the Watch Party waits.
        const party = live();
        if (party && waitingForMe(party)) apply();
        return;
      }
      case "ended":
        return heardEnded();
      case "error":
        if (!sourceFailed(event)) return;
        setView({ player: "failed" });
        return reportPlayer();
    }
  }

  /**
   * The player started, paused or changed speed: because party sync told it
   * to (an echo), or because the Viewer did it in the Source's controls.
   */
  function heardPlayback(event: Extract<PlayerEvent, { type: "play" | "pause" | "ratechange" }>) {
    if (event.type === "play") playStarted();
    playerIsAt(playerPosition());
    const before = { paused: player.paused, rate: player.rate };
    const echo = echoes.heard(event);
    // An echo of an older command leaves the player as the newer ones (still on their way) will have it.
    if (!echo || echo.latest) {
      if (event.type === "ratechange") player.rate = event.rate;
      else player.paused = event.type === "pause";
    }
    const changed = player.paused !== before.paused || player.rate !== before.rate;
    // The player stopped by itself at the end of the Title; "ended" follows.
    if (!echo && event.type === "pause" && atTheEnd()) return;
    if (!echo && changed && sentAsViewerChange(event)) return;
    apply();
  }

  /**
   * The Viewer chose another episode in the Source's own player, which
   * moved there by itself: both Viewers move to it, and the player loads it
   * anew with the other's. (The same episode: the player loads it anew where
   * the Watch Party is.)
   */
  function heardEpisode({ season, episode }: Episode) {
    const party = live();
    loaded = null;
    const current = party?.episode;
    if (current && (current.season !== season || current.episode !== episode)) {
      watchParty.changeEpisode({ season, episode });
    } else {
      followParty();
    }
  }

  /** How close to the end of the Title a player that stops counts as having reached it. */
  const END_TOLERANCE_S = 1;

  function atTheEnd() {
    return duration !== null && playerPosition() >= duration - END_TOLERANCE_S;
  }

  /**
   * The player reached the end of the Title: tells the coordinator, with the
   * episode after it (looked up in the episode guide) for a TV show.
   */
  function heardEnded() {
    playerIsAt(duration ?? playerPosition());
    player.paused = true;
    stoppedAtTheEnd = true;
    const party = live();
    if (!party || view.player !== "ready" || !takesPlaybackChanges(party.phase)) return;
    const { id, title } = party;
    const episode = loadedEpisode;
    const position = playerPosition();
    if (!episode) {
      watchParty.titleEnded(id, null, position, null);
      return;
    }
    episodes.episodesOf(title.tmdbId).then(
      (show) => {
        if (!destroyed) watchParty.titleEnded(id, episode, position, episodeAfter(show, episode));
      },
      (error: unknown) => console.error(`Could not look up the episode after S${episode.season}E${episode.episode}`, error),
    );
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
    loadedSource = party.source;
    duration = null;
    stoppedAtTheEnd = false;
    echoes.clear();
    reported = null;
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

  /**
   * Tells the coordinator, once per Watch Party (and again on a new
   * connection: the coordinator knows players by connection), that the
   * player is ready, or that its Source failed (Source fallback then offers
   * the next one).
   */
  function reportPlayer() {
    const party = live();
    if (!party || loadedSource === null || view.player === "loading") return;
    const on = client.identity?.deviceId ?? null;
    if (reported?.partyId === party.id && reported.player === view.player && reported.on === on) return;
    reported = { partyId: party.id, player: view.player, on };
    if (view.player === "ready") watchParty.playerReady(party.id, loadedEpisode, loadedSource);
    else watchParty.playerFailed(party.id, loadedEpisode, loadedSource);
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

  /** "Next episode in 10s": counts the seconds until both move on, on the server's clock. */
  function showNextEpisode() {
    if (nextEpisodeTimer !== null) clock.clearTimeout(nextEpisodeTimer);
    nextEpisodeTimer = null;
    const phase = live()?.phase;
    if (phase?.name !== "next-episode") {
      setView({ nextEpisode: null });
      return;
    }
    const remaining = phase.at - client.serverNow();
    const secondsLeft = Math.max(0, Math.ceil(remaining / 1000));
    const shown = view.nextEpisode;
    if (shown?.episode !== phase.next || shown.secondsLeft !== secondsLeft) {
      setView({ nextEpisode: { episode: phase.next, secondsLeft } });
    }
    if (secondsLeft > 0) nextEpisodeTimer = clock.setTimeout(showNextEpisode, remaining - (secondsLeft - 1) * 1000);
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
    if (destroyed) return;
    if (!party) {
      // Its Watch Party is over (the other Viewer left): nothing to wait or count down for any more.
      setView({ waitingFor: null, gettingReady: false });
      countDown();
      showNextEpisode();
      return;
    }
    load(party);
    setView({
      waitingFor: waitingFor(party),
      gettingReady: party.phase.name === "countdown" && party.phase.endsAt === null,
    });
    tellChange(party);
    reportPlayer();
    countDown();
    startOnTime(party);
    showNextEpisode();
  }

  /** "Waiting for Mariam…": for the other Viewer to join, or for a Viewer to catch up or come back. */
  function waitingFor({ phase, starter }: WatchPartyState) {
    if (phase.name === "inviting") return otherViewer(starter);
    return phase.name === "waiting" ? phase.viewer : null;
  }

  /**
   * After a play command: a player that has not said "play" within
   * `PLAY_REFUSED_MS` did not start (the browser refused it), so the Viewer
   * is offered "Click to resume", and the player stays where it was.
   */
  function expectPlayToStart() {
    if (playTimer !== null) return;
    playTimer = clock.setTimeout(() => {
      playTimer = null;
      if (destroyed || view.player !== "ready") return;
      playerIsAt(player.position);
      player.paused = true;
      setView({ clickToResume: true });
    }, PLAY_REFUSED_MS);
  }

  /** The player said "play": it can start. */
  function playStarted() {
    if (playTimer !== null) clock.clearTimeout(playTimer);
    playTimer = null;
    setView({ clickToResume: false });
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

    resume() {
      if (destroyed) return;
      setView({ clickToResume: false });
      apply();
    },

    destroy() {
      destroyed = true;
      stopFollowing();
      stopCatchingUp();
      if (reportTimer !== null) clock.clearTimeout(reportTimer);
      if (startTimer !== null) clock.clearTimeout(startTimer);
      if (playTimer !== null) clock.clearTimeout(playTimer);
      if (countdownTimer !== null) clock.clearTimeout(countdownTimer);
      if (changeTimer !== null) clock.clearTimeout(changeTimer);
      if (nextEpisodeTimer !== null) clock.clearTimeout(nextEpisodeTimer);
      adapter?.destroy();
      adapter = null;
      listeners.clear();
    },
  };
}
