/**
 * The Watch Party's messages and its shared state (ADR 0002). The coordinator
 * (`./coordinator.ts`) is the single authority: devices send intents, and the
 * coordinator answers every change with the whole new shared state.
 */
import type { Viewer } from "../../models/Viewer";
import type { SourceId } from "../../utils/sources";
import type { DeviceId } from "../connection/protocol";
import type { TitleRef } from "../presence/protocol";

/** One episode of a TV show. */
export interface Episode {
  season: number;
  episode: number;
}

/**
 * Where playback is on the server's timeline: at `serverTime` the Title is
 * `position` seconds in, and from then on it moves at `rate` while
 * `playing`. A `serverTime` in the future (the countdown) means "start
 * there, at that moment".
 */
export interface PlaybackAnchor {
  position: number;
  serverTime: number;
  playing: boolean;
  rate: number;
}

/** Where `anchor` says the player should be at `serverTime`. */
export function anchorAt(anchor: PlaybackAnchor, serverTime: number) {
  const playing = anchor.playing && serverTime >= anchor.serverTime;
  const elapsed = playing ? ((serverTime - anchor.serverTime) / 1000) * anchor.rate : 0;
  return { playing, position: anchor.position + elapsed };
}

/** Why a Watch Party ended. */
export type WatchPartyEndReason =
  /** A Viewer pressed Cancel (or closed the player) and ended it for both. */
  | "cancelled"
  /** A Viewer started another Watch Party in its place. */
  | "replaced"
  /** The movie, or the TV show's final episode, ended. */
  | "finished"
  /** A Viewer closed the player: the other Viewer keeps watching alone, or stops. */
  | "left"
  /**
   * While the Watch Party still waited for the other Viewer, its starter had
   * no device on the site for two minutes (`INVITE_GRACE_MS` in `./drift.ts`).
   */
  | "gone";

/**
 * What the Watch Party is doing. In order:
 * waiting for the other Viewer → countdown → playing / paused → waiting for
 * a Viewer who fell behind or disconnected → next-episode countdown → ended.
 */
export type WatchPartyPhase =
  /** The starter waits for the other Viewer to join. */
  | { name: "inviting" }
  /**
   * Both Viewers are in; playback starts at `endsAt` (server time). Null
   * while a player is still loading: the 3-2-1 starts once both are ready.
   */
  | { name: "countdown"; endsAt: number | null }
  | { name: "playing" }
  | { name: "paused" }
  /** Everyone is paused until `viewer` catches up or comes back. */
  | { name: "waiting"; viewer: Viewer; reason: "behind" | "disconnected" }
  /** The episode ended; both move to `next` at `at` (server time) unless a Viewer cancels. */
  | { name: "next-episode"; at: number; next: Episode }
  | { name: "ended"; reason: WatchPartyEndReason; by: Viewer };

export type WatchPartyPhaseName = WatchPartyPhase["name"];

/** How the Watch Party is held: in a Syncable Source's player, or by Tab Share over the Call. */
export type WatchPartyMode = "syncable-source" | "tab-share";

/**
 * Tab Share (`./tabShare.ts`): `sharer` plays `source` (any Source) in
 * their player and shares that browser tab over the Call; the other Viewer
 * watches it there. `sound`: whether the browser shared the tab's sound too.
 */
export interface TabShare {
  sharer: Viewer;
  source: SourceId;
  sound: boolean;
}

/** Whether `viewer` is the one sharing their tab in `party`'s Tab Share (or the one it ended in). */
export function sharesTab(party: Pick<WatchPartyState, "tabShare">, viewer: Viewer | null): boolean {
  return viewer !== null && party.tabShare?.sharer === viewer;
}

/**
 * What both Viewers are offered once the Watch Party's Source could not play
 * the Title: the next Syncable Source, or, when no Syncable Source is left,
 * Tab Share.
 */
export type SourceFallback = { kind: "source"; source: SourceId } | { kind: "tab-share" };

/** The shared state of the one Watch Party, as every device hears it. */
export interface WatchPartyState {
  id: string;
  /** Grows with every change, across Watch Parties: a device ignores a state older than one it has. */
  seq: number;
  /** The Viewer who pressed "Watch together". */
  starter: Viewer;
  title: TitleRef;
  /** The episode, for a TV show; null for a movie. */
  episode: Episode | null;
  /** The Syncable Source both players use (in Tab Share: the one they go back to). */
  source: SourceId;
  /**
   * The Syncable Sources that could not play the Title (this episode of it)
   * on a Viewer's device, in the order they failed.
   */
  failedSources: SourceId[];
  /** What both Viewers are offered now that `source` failed; null while it works. */
  fallback: SourceFallback | null;
  mode: WatchPartyMode;
  /** In Tab Share mode: who shares their tab, playing what; null otherwise. */
  tabShare: TabShare | null;
  phase: WatchPartyPhase;
  anchor: PlaybackAnchor;
  /** The Viewer who made the last change. */
  lastChangeBy: Viewer;
  /**
   * The last change a Viewer made to playback, for the other Viewer's change
   * message ("Mariam paused at 1:02:14"); null before the first. Later
   * states carry it on: it is news only in the state whose `seq` it has.
   */
  lastChange: WatchPartyChange | null;
  /**
   * The one device of each Viewer that takes part: the newest one they
   * joined from. Null for a Viewer not (yet) in it.
   */
  activeDevices: Record<Viewer, DeviceId | null>;
}

/** "Watch together": start a Watch Party, or replace the one with id `replacing`. */
export interface StartWatchPartyMessage {
  type: "watchParty:start";
  title: TitleRef;
  episode: Episode | null;
  /** The id of the Watch Party the Viewer chose to replace; null to start only if none exists. */
  replacing: string | null;
}

/** The invited Viewer joins from this device. */
export interface JoinWatchPartyMessage {
  type: "watchParty:join";
  partyId: string;
}

/**
 * A Viewer who takes part from another device joins from this one: it takes
 * the Watch Party over, and the other device stops.
 */
export interface TakeOverWatchPartyMessage {
  type: "watchParty:takeOver";
  partyId: string;
}

/** Ends the Watch Party for both Viewers. */
export interface CancelWatchPartyMessage {
  type: "watchParty:cancel";
  partyId: string;
}

/**
 * This device's player loaded the Watch Party's Title and can be controlled
 * ("ready"), or its Source could not play it ("failed": the Source does not
 * have it, or did not load in time).
 */
export interface PlayerStatusMessage {
  type: "watchParty:player";
  partyId: string;
  status: "ready" | "failed";
  /** The episode the player loaded (null: a movie): a report about an earlier episode does not count. */
  episode: Episode | null;
  /** The Source the player loaded: a report about an earlier Source does not count. */
  source: SourceId;
}

/**
 * A change a Viewer made in the Source's own controls, at `position`
 * seconds into the Title (for "seek": the position it moved to). "rate"
 * (the speed) only comes from a Source whose adapter `canSetRate`.
 */
export type PlaybackChange =
  | { kind: "play" | "pause" | "seek"; position: number }
  | { kind: "rate"; position: number; rate: number };

/**
 * A change a Viewer made, for the other Viewer's change message.
 * "next-cancelled": they cancelled "Next episode in 10s", so both stay at the
 * end of the episode. "tab-share-stopped": they stopped a Tab Share (theirs
 * or the other Viewer's). "sharer-gone": their device, which shared its tab,
 * was gone so long that the Tab Share stopped (`TAB_SHARE_GONE_MS` in
 * `./drift.ts`).
 */
export type ChangeMade =
  | PlaybackChange
  | { kind: "episode"; episode: Episode }
  | { kind: "source"; source: SourceId }
  | { kind: "next-cancelled" }
  | { kind: "tab-share-stopped" }
  | { kind: "sharer-gone" };

/** A change `by` made, in the shared state numbered `seq`. */
export type WatchPartyChange = ChangeMade & { by: Viewer; seq: number };

/**
 * For the coordinator: what the shared state after `party` says about the
 * change `by` made to it, `change`. That state is numbered next after
 * `party`, so the change is news only in it.
 */
export function changeMadeBy(
  party: WatchPartyState,
  by: Viewer,
  change: ChangeMade,
): Pick<WatchPartyState, "lastChangeBy" | "lastChange"> {
  return { lastChangeBy: by, lastChange: { ...change, by, seq: party.seq + 1 } };
}

/**
 * Whether Viewers control playback in this phase: both are in and the Title
 * has started. In any other phase each player just follows the shared state.
 */
export function takesPlaybackChanges(phase: WatchPartyPhase) {
  return phase.name === "playing" || phase.name === "paused";
}

/** The Viewer changed playback in this device's player: apply it for both Viewers. */
export interface PlaybackMessage {
  type: "watchParty:playback";
  partyId: string;
  change: PlaybackChange;
}

/** The Viewer chose another episode of the TV show: both Viewers move to it. */
export interface ChangeEpisodeMessage {
  type: "watchParty:episode";
  partyId: string;
  episode: Episode;
}

/**
 * The Viewer switches the Watch Party to another Syncable Source (or takes
 * the one its `fallback` offers): both players move there, at the current
 * position.
 */
export interface SwitchSourceMessage {
  type: "watchParty:source";
  partyId: string;
  source: SourceId;
}

/** How often party sync reports where its player is (`PositionMessage`). */
export const POSITION_REPORT_MS = 1000;

/**
 * Where this device's player is, sent every `POSITION_REPORT_MS` (`./drift.ts`)
 * so the coordinator can keep the players in step: `position` seconds into
 * the Title at `serverTime`, on the server's clock, while following the
 * shared state numbered `seq`.
 */
export interface PositionMessage {
  type: "watchParty:position";
  partyId: string;
  seq: number;
  position: number;
  serverTime: number;
  /**
   * The player should be playing but does not move: its stream stalled, or
   * the browser would not start it until the Viewer clicks (after a reload).
   */
  stalled: boolean;
}

/**
 * This device's player reached the end of the Title (for a TV show: of
 * `episode`), at `position` seconds.
 */
export interface TitleEndedMessage {
  type: "watchParty:ended";
  partyId: string;
  episode: Episode | null;
  position: number;
  /**
   * The episode after it, as the device's episode guide has it
   * (`./episodeGuide.ts`); null after a TV show's final episode, and for a movie.
   */
  next: Episode | null;
}

/** "Cancel" on "Next episode in 10s": both Viewers stay at the end of the episode. */
export interface CancelNextEpisodeMessage {
  type: "watchParty:cancelNext";
  partyId: string;
}

/**
 * The Viewer closed the Watch Party player: the Watch Party ends, and the
 * other Viewer chooses to keep watching alone or to stop. While it still
 * waits for the other Viewer, it is cancelled instead.
 */
export interface LeaveWatchPartyMessage {
  type: "watchParty:leave";
  partyId: string;
}

/**
 * Tab Share: this device shares its tab over the Call, playing `source` (any
 * Source), with the tab's sound or without it (`sound`). From the device
 * that already shares: it now plays `source`.
 */
export interface TabShareMessage {
  type: "watchParty:tabShare";
  partyId: string;
  source: SourceId;
  sound: boolean;
}

/** Either Viewer stops the Tab Share: both go back to the Syncable Source. */
export interface StopTabShareMessage {
  type: "watchParty:stopTabShare";
  partyId: string;
}

/** The current Watch Party (null: none), sent to every device on connect and after every change. */
export interface WatchPartyMessage {
  type: "watchParty";
  party: WatchPartyState | null;
}

/** The answer to a start while another Watch Party exists: the Viewer chooses Join or Replace. */
export interface AlreadyStartedMessage {
  type: "watchParty:alreadyStarted";
  party: WatchPartyState;
}

/**
 * This device's player drifted from the shared state numbered `seq`: move it
 * to where the shared state is now.
 */
export interface CatchUpMessage {
  type: "watchParty:catchUp";
  partyId: string;
  seq: number;
}

export type WatchPartyDeviceMessage =
  | StartWatchPartyMessage
  | JoinWatchPartyMessage
  | TakeOverWatchPartyMessage
  | CancelWatchPartyMessage
  | PlayerStatusMessage
  | PlaybackMessage
  | ChangeEpisodeMessage
  | SwitchSourceMessage
  | PositionMessage
  | TitleEndedMessage
  | CancelNextEpisodeMessage
  | LeaveWatchPartyMessage
  | TabShareMessage
  | StopTabShareMessage;

export type WatchPartyServerMessage = WatchPartyMessage | AlreadyStartedMessage | CatchUpMessage;
