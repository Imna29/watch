/**
 * Party sync: on the one device of a Viewer that takes part in the Watch
 * Party, joins a Syncable Source adapter to the realtime connection.
 * Framework-free; `composables/useWatchParty.ts` wraps it for Vue, and the
 * seam 1 harness drives it with a fake Source player.
 *
 * It loads the Watch Party's Title (or episode) in its Source, keeps the
 * player where the shared state's anchor says it should be, sends the
 * Viewer's own play, pause, seek and speed changes on as intents, and
 * exposes what the player shell shows over the player (`PartySyncView`).
 * Its parts, in `./partySync/`:
 * - `echoes.ts`: the commands it gives the player, whose reports are never
 *   sent back as the Viewer's changes;
 * - `positionReports.ts`: where the player is, for staying in step, and
 *   when it stalled or the browser would not start it ("Click to resume");
 * - `ending.ts`: the end of the Title, and "Next episode in 10s";
 * - `playerStatus.ts`: the player ready, or its Source failed (Source fallback);
 * - `player.ts` and `view.ts`: the player as party sync sees it, and the view.
 */
import { otherViewer } from "../../models/Viewer";
import type { Playable, SourceId } from "../../utils/sources";
import type { Clock, TimerId } from "../clock";
import type { DeviceClient } from "../deviceClient";
import type { DeviceWatchParty } from "./device";
import type { EpisodeGuide } from "./episodeGuide";
import { createEchoes } from "./partySync/echoes";
import { createEnding } from "./partySync/ending";
import { createPlayerModel, SEEK_TOLERANCE_S } from "./partySync/player";
import { createPlayerStatus } from "./partySync/playerStatus";
import { createPositionReports } from "./partySync/positionReports";
import { createView, type PartySyncView } from "./partySync/view";
import { anchorAt, takesPlaybackChanges, type Episode, type WatchPartyState } from "./protocol";
import { sourceFailed, type PlayerEvent, type PlayerFrame, type SyncableSourceAdapter } from "./sources/adapter";
import { hasAdapter, SYNCABLE_SOURCE_ADAPTERS } from "./sources";

export type { PartySyncView } from "./partySync/view";

/** How long the other Viewer's change message stays. */
const CHANGE_MESSAGE_MS = 5000;

/** A player that fell behind plays on until it is this close to where the Watch Party waits for it. */
const CAUGHT_UP_S = 0.1;

/** The most a seek is taken to last when aiming ahead by it (see `seekLagS`). */
const MAX_SEEK_LAG_S = 5;

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

export function createPartySync({
  watchParty,
  client,
  clock,
  frame,
  readyTimeoutMs,
  episodes,
}: PartySyncOptions): PartySync {
  const view = createView();
  let adapter: SyncableSourceAdapter | null = null;
  const player = createPlayerModel(clock);
  const echoes = createEchoes(clock);
  /** How long this player's last seek took to carry out, in seconds: seeks aim that far ahead (`seekTo`). */
  let seekLagS = 0;
  let countdownTimer: TimerId | null = null;
  /** What the frame has loaded: the Source and what it plays (see `load`). */
  let loaded: string | null = null;
  let loadedEpisode: Episode | null = null;
  let loadedSource: SourceId | null = null;
  /** The shared state last looked at for a change message, by `seq`. */
  let seenSeq: number | null = null;
  let changeTimer: TimerId | null = null;
  let startTimer: TimerId | null = null;
  let destroyed = false;

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

  const ending = createEnding({ clock, client, watchParty, episodes, player, view, live });
  const playerStatus = createPlayerStatus({ client, watchParty });
  const positionReports = createPositionReports({
    clock,
    client,
    watchParty,
    player,
    echoes,
    view,
    live,
    stoppedAtTheEnd: () => ending.stoppedAtTheEnd,
  });

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
    const behind = waitingForMe(party) && player.position() < wanted.position - CAUGHT_UP_S;
    return behind ? { playing: true, position: player.position() } : wanted;
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
    player.isAt(position);
  }

  /**
   * After a seek that took longer than `seekLagS` said: one that landed
   * behind a playing Watch Party seeks again, aiming as far ahead as this
   * one took. Never back: a player that landed ahead stays there.
   */
  function landInStep() {
    const party = live();
    if (!party || view.current.player !== "ready") return;
    const wanted = wantedNow(party);
    if (wanted.playing && player.position() < wanted.position - SEEK_TOLERANCE_S) {
      seekTo(wanted, party.anchor.rate, false);
    }
  }

  /** Moves the player to where the shared state is now (also when the coordinator says it drifted). */
  function seekToParty(party: WatchPartyState) {
    const wanted = anchorAt(party.anchor, client.serverNow());
    if (ending.staysAtTheEnd(wanted.position)) return;
    seekTo(wanted, party.anchor.rate);
  }

  /** Moves the player to where the shared state says it should be now. */
  function apply() {
    const party = live();
    if (!adapter || view.current.player !== "ready" || !party) return;
    const wanted = wantedNow(party);
    if (ending.staysAtTheEnd(wanted.position)) return;
    if (Math.abs(player.position() - wanted.position) > SEEK_TOLERANCE_S) seekTo(wanted, party.anchor.rate);
    if (wanted.playing && player.paused && !view.current.clickToResume) {
      adapter.play();
      echoes.expect({ type: "play" });
      player.isAt(player.position());
      player.paused = false;
      positionReports.expectPlayToStart();
    } else if (!wanted.playing && !player.paused) {
      adapter.pause();
      echoes.expect({ type: "pause" });
      player.isAt(player.position());
      player.paused = true;
    }
    // On a Source that cannot change speed, the player stays at its own.
    if (adapter.canSetRate && player.rate !== party.anchor.rate) {
      adapter.setRate(party.anchor.rate);
      echoes.expect({ type: "ratechange", rate: party.anchor.rate });
      player.isAt(player.position());
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
        view.set({ player: "ready" });
        reportPlayer();
        // The embed URL told the player to autoplay: its "play" is that command's echo.
        echoes.expect({ type: "play" });
        adapter?.requestStatus();
        return apply();
      case "status":
        player.isAt(event.position);
        player.paused = event.paused;
        return apply();
      case "play":
      case "pause":
      case "ratechange":
        return heardPlayback(event);
      case "seeked": {
        player.isAt(event.position);
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
        player.isAt(event.position);
        if (event.duration !== undefined) ending.heardDuration(event.duration);
        // Catching up: stop where the Watch Party waits.
        const party = live();
        if (party && waitingForMe(party)) apply();
        return;
      }
      case "ended":
        return ending.heardEnded();
      case "error":
        if (!sourceFailed(event)) return;
        view.set({ player: "failed" });
        return reportPlayer();
    }
  }

  /**
   * The player started, paused or changed speed: because party sync told it
   * to (an echo), or because the Viewer did it in the Source's controls.
   */
  function heardPlayback(event: Extract<PlayerEvent, { type: "play" | "pause" | "ratechange" }>) {
    if (event.type === "play") positionReports.playStarted();
    player.isAt(player.position());
    const before = { paused: player.paused, rate: player.rate };
    const echo = echoes.heard(event);
    // An echo of an older command leaves the player as the newer ones (still on their way) will have it.
    if (!echo || echo.latest) {
      if (event.type === "ratechange") player.rate = event.rate;
      else player.paused = event.type === "pause";
    }
    const changed = player.paused !== before.paused || player.rate !== before.rate;
    // The player stopped by itself at the end of the Title; "ended" follows.
    if (!echo && event.type === "pause" && ending.atTheEnd()) return;
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

  /**
   * Shared controls: when `event` is the Viewer's own change in the Source's
   * controls (it is no echo, and it changed the player), sends it to the
   * coordinator and returns true. The player then stays where the Viewer put
   * it; the new shared state follows. Outside playing and paused, nothing
   * is sent: the player follows the shared state.
   */
  function sentAsViewerChange(event: PlayerEvent): boolean {
    const party = live();
    if (!party || view.current.player !== "ready" || !takesPlaybackChanges(party.phase)) return false;
    switch (event.type) {
      case "play":
      case "pause":
        watchParty.playback(party.id, { kind: event.type, position: player.position() });
        return true;
      case "seeked": {
        const wanted = anchorAt(party.anchor, client.serverNow());
        if (Math.abs(event.position - wanted.position) <= SEEK_TOLERANCE_S) return false;
        watchParty.playback(party.id, { kind: "seek", position: event.position });
        return true;
      }
      case "ratechange":
        if (!adapter?.canSetRate) return false;
        watchParty.playback(party.id, { kind: "rate", position: player.position(), rate: event.rate });
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
    ending.loaded(party.episode);
    echoes.clear();
    playerStatus.reset();
    const startAt = anchorAt(party.anchor, client.serverNow()).position;
    player.reset(startAt);
    if (adapter?.source.id !== party.source) {
      adapter?.destroy();
      adapter = null;
      if (!hasAdapter(party.source)) {
        view.set({ player: "failed" });
        return;
      }
      adapter = SYNCABLE_SOURCE_ADAPTERS[party.source]({ frame, clock, readyTimeoutMs });
      adapter.on(heard);
    }
    view.set({ player: "loading" });
    adapter.load(playable, startAt);
  }

  /** Tells the coordinator that the player is ready, or that its Source failed (`./partySync/playerStatus.ts`). */
  function reportPlayer() {
    const party = live();
    const status = view.current.player;
    if (!party || loadedSource === null || status === "loading") return;
    playerStatus.report(party, status, loadedSource, loadedEpisode);
  }

  /** Shows 3, 2, 1 until the countdown's end, on the server's clock. */
  function countDown() {
    if (countdownTimer !== null) clock.clearTimeout(countdownTimer);
    countdownTimer = null;
    const phase = live()?.phase;
    const endsAt = phase?.name === "countdown" ? phase.endsAt : null;
    const remaining = endsAt === null ? 0 : endsAt - client.serverNow();
    if (remaining < 1) {
      view.set({ countdown: null });
      return apply();
    }
    const secondsLeft = Math.ceil(remaining / 1000);
    view.set({ countdown: secondsLeft });
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
    view.set({ lastChange: change });
    changeTimer = clock.setTimeout(() => {
      changeTimer = null;
      view.set({ lastChange: null });
    }, CHANGE_MESSAGE_MS);
  }

  function followParty() {
    const party = live();
    if (destroyed) return;
    if (!party) {
      // Its Watch Party is over (the other Viewer left): nothing to wait or count down for any more.
      view.set({ waitingFor: null, gettingReady: false });
      countDown();
      ending.showNextEpisode();
      return;
    }
    load(party);
    view.set({
      waitingFor: waitingFor(party),
      gettingReady: party.phase.name === "countdown" && party.phase.endsAt === null,
    });
    tellChange(party);
    reportPlayer();
    countDown();
    startOnTime(party);
    ending.showNextEpisode();
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
  positionReports.start();
  // The coordinator saw the player drift from the shared state it reported on: move it there.
  const stopCatchingUp = client.on("watchParty:catchUp", ({ partyId, seq }) => {
    const party = live();
    if (destroyed || view.current.player !== "ready" || party?.id !== partyId || party.seq !== seq) return;
    seekToParty(party);
  });

  return {
    get view() {
      return view.current;
    },

    subscribe: view.subscribe,

    resume() {
      if (destroyed) return;
      view.set({ clickToResume: false });
      apply();
    },

    destroy() {
      destroyed = true;
      stopFollowing();
      stopCatchingUp();
      positionReports.stop();
      if (startTimer !== null) clock.clearTimeout(startTimer);
      if (countdownTimer !== null) clock.clearTimeout(countdownTimer);
      if (changeTimer !== null) clock.clearTimeout(changeTimer);
      ending.stop();
      adapter?.destroy();
      adapter = null;
      view.clear();
    },
  };
}
