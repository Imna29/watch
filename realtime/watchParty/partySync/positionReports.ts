/**
 * Party sync's position reports: every `POSITION_REPORT_MS` it tells the
 * coordinator where its player is, on the server's clock, so the coordinator
 * keeps the players in step (`../drift.ts`). A report says the player is
 * `stalled` when it should be playing but does not move: it said nothing for
 * `STALL_MS`, or it never started after a play command, which the browser
 * refused ("Click to resume").
 */
import type { Clock, TimerId } from "../../clock";
import type { DeviceClient } from "../../deviceClient";
import type { DeviceWatchParty } from "../device";
import { POSITION_REPORT_MS, type WatchPartyState } from "../protocol";
import type { Echoes } from "./echoes";
import type { PlayerModel } from "./player";
import type { ViewStore } from "./view";

/**
 * A playing player tells its time at least about once a second. One that has
 * said nothing for this long has stalled.
 */
const STALL_MS = 2000;

/** A player says "play" at once when it starts; one still silent this long after a play command did not start. */
const PLAY_REFUSED_MS = 2000;

export interface PositionReportsOptions {
  clock: Clock;
  client: DeviceClient;
  watchParty: DeviceWatchParty;
  player: PlayerModel;
  echoes: Echoes;
  view: ViewStore;
  /** The Watch Party party sync is for, while it goes on; null after. */
  live(): WatchPartyState | null;
  /** Whether the player stopped at the end of what it plays: it has no drift to report. */
  stoppedAtTheEnd(): boolean;
}

export function createPositionReports({
  clock,
  client,
  watchParty,
  player,
  echoes,
  view,
  live,
  stoppedAtTheEnd,
}: PositionReportsOptions) {
  let reportTimer: TimerId | null = null;
  /** While a play command waits for the player's "play": the timer that gives up on it. */
  let playTimer: TimerId | null = null;
  let stopped = false;

  /** Not while a seek is on its way: the player is not where it is going yet. */
  function report() {
    reportTimer = clock.setTimeout(report, POSITION_REPORT_MS);
    const party = live();
    if (!party || view.current.player !== "ready" || stoppedAtTheEnd() || echoes.awaiting("seeked")) return;
    if (!player.paused && !player.stalled && player.silentForMs() > STALL_MS) player.stalled = true;
    watchParty.reportPosition({
      partyId: party.id,
      seq: party.seq,
      position: player.position(),
      serverTime: client.serverNow(),
      stalled: player.stalled || view.current.clickToResume,
    });
  }

  return {
    /** Starts reporting, one `POSITION_REPORT_MS` from now. */
    start() {
      reportTimer = clock.setTimeout(report, POSITION_REPORT_MS);
    },

    /**
     * After a play command: a player that has not said "play" within
     * `PLAY_REFUSED_MS` did not start (the browser refused it), so the Viewer
     * is offered "Click to resume", and the player stays where it was.
     */
    expectPlayToStart() {
      if (playTimer !== null) return;
      playTimer = clock.setTimeout(() => {
        playTimer = null;
        if (stopped || view.current.player !== "ready") return;
        player.stoodStill();
        view.set({ clickToResume: true });
      }, PLAY_REFUSED_MS);
    },

    /** The player said "play": it can start. */
    playStarted() {
      if (playTimer !== null) clock.clearTimeout(playTimer);
      playTimer = null;
      view.set({ clickToResume: false });
    },

    stop() {
      stopped = true;
      if (reportTimer !== null) clock.clearTimeout(reportTimer);
      if (playTimer !== null) clock.clearTimeout(playTimer);
    },
  };
}
