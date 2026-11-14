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

/** Why a Watch Party ended. */
export type WatchPartyEndReason =
  /** A Viewer pressed Cancel (or closed the player) and ended it for both. */
  | "cancelled"
  /** A Viewer started another Watch Party in its place. */
  | "replaced";

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
  /** The Syncable Source both players use (in Tab Share: the one the sharer plays). */
  source: SourceId;
  mode: WatchPartyMode;
  phase: WatchPartyPhase;
  anchor: PlaybackAnchor;
  /** The Viewer who made the last change. */
  lastChangeBy: Viewer;
  /** The one device of each Viewer that takes part; null for a Viewer not (yet) in it. */
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

/** Ends the Watch Party for both Viewers. */
export interface CancelWatchPartyMessage {
  type: "watchParty:cancel";
  partyId: string;
}

/** This device's player loaded the Watch Party's Title and can be controlled. */
export interface PlayerStatusMessage {
  type: "watchParty:player";
  partyId: string;
  status: "ready";
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

export type WatchPartyDeviceMessage =
  | StartWatchPartyMessage
  | JoinWatchPartyMessage
  | CancelWatchPartyMessage
  | PlayerStatusMessage;

export type WatchPartyServerMessage = WatchPartyMessage | AlreadyStartedMessage;
