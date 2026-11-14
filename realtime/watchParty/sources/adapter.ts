/**
 * Syncable Source adapters (ADR 0002): one per Syncable Source, each
 * translating this one interface to and from its Source's documented
 * `postMessage` format. Framework-free: the iframe is reached through a
 * `PlayerFrame`, so tests can put a fake Source player behind it.
 *
 * Times are in seconds everywhere.
 */
import type { Clock } from "../../clock";
import type { Playable, Source } from "../../../utils/sources";

/**
 * The iframe a Source's player runs in, as the site sees it.
 * The browser's version is in `composables/useWatchParty.ts`.
 */
export interface PlayerFrame {
  /** Loads `url` as a new document; messages from earlier documents are no longer heard. */
  load(url: string): void;
  /** Posts `message` to the current document, if its origin is `targetOrigin`. */
  post(message: unknown, targetOrigin: string): void;
  /**
   * Calls `listener` with every message the current document posts to the
   * site, with the origin it came from. Returns a function that stops it.
   */
  onMessage(listener: (origin: string, data: unknown) => void): () => void;
}

/** What a Syncable Source's player reports. */
export type PlayerEvent =
  /** The player loaded and accepts commands. Commands sent before it are dropped. */
  | { type: "ready" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "seeked"; position: number }
  | { type: "timeupdate"; position: number }
  | { type: "ratechange"; rate: number }
  | { type: "ended" }
  /** The answer to `requestStatus()`. */
  | { type: "status"; position: number; paused: boolean }
  /**
   * The Source failed: `not-ready` when no "ready" arrived in time (the
   * Source does not have the Title, or is down), `unavailable` when the
   * player said no server of the Source has the Title, `playback` when the
   * player reported an error.
   */
  | { type: "error"; reason: "not-ready" | "unavailable" | "playback"; message: string };

export type PlayerEventType = PlayerEvent["type"];

/** Whether `event` says the Source could not load the Title, so the Watch Party needs another Source. */
export function sourceFailed(event: PlayerEvent): boolean {
  return event.type === "error" && event.reason !== "playback";
}

export interface SyncableSourceAdapter {
  readonly source: Source;
  /** Whether `setRate` does anything on this Source. */
  readonly canSetRate: boolean;
  /** Loads `playable` into the frame, starting `startAt` seconds in, and waits for it to be ready. */
  load(playable: Playable, startAt: number): void;
  play(): void;
  pause(): void;
  seek(position: number): void;
  setRate(rate: number): void;
  /** Asks the player where it is and whether it is paused; the answer comes as a "status" event. */
  requestStatus(): void;
  /** Calls `listener` with every event of the current document. Returns a function that stops it. */
  on(listener: (event: PlayerEvent) => void): () => void;
  /** Stops listening to the frame and cancels timers. */
  destroy(): void;
}

export interface AdapterOptions {
  frame: PlayerFrame;
  clock: Clock;
  /** How long to wait for "ready" after `load` before reporting the Source failed. */
  readyTimeoutMs?: number;
}

export type AdapterFactory = (options: AdapterOptions) => SyncableSourceAdapter;

/**
 * CineSrc can take a while to find a server that has the Title, and sends
 * nothing when none does, so "not ready by now" is how failure shows.
 */
export const DEFAULT_READY_TIMEOUT_MS = 20_000;

/** What every adapter does the same way: the frame, the origin check, "ready" and its timeout. */
export interface SourceLink {
  /** Whether the current document said it is ready. */
  readonly ready: boolean;
  /** Loads `url` and waits for "ready" again, for up to the ready timeout. */
  load(url: string): void;
  /** Posts a command to the current document; dropped until it is ready, as the players drop them. */
  post(message: unknown): void;
  /** Posts to the current document even before it is ready: asking a player that never says it is. */
  probe(message: unknown): void;
  /**
   * Reports `event` to the adapter's listeners; "ready" also marks the
   * document ready, and it or the Source failing ends the wait for it.
   */
  emit(event: PlayerEvent): void;
  on(listener: (event: PlayerEvent) => void): () => void;
  destroy(): void;
}

/**
 * Connects an adapter for `source` to its frame. `receive` hears only
 * messages from the origins the Source catalog lists for `source`: the
 * players post with target "*", and the page has other frames (ads, for one).
 */
export function createSourceLink(
  source: Source,
  { frame, clock, readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS }: AdapterOptions,
  receive: (data: unknown) => void,
): SourceLink {
  const listeners = new Set<(event: PlayerEvent) => void>();
  let origin: string | null = null;
  let ready = false;
  let readyTimer: unknown = null;

  const stopListening = frame.onMessage((from, data) => {
    if (source.origins.includes(from)) receive(data);
  });

  function clearReadyTimer() {
    if (readyTimer !== null) clock.clearTimeout(readyTimer);
    readyTimer = null;
  }

  const link: SourceLink = {
    get ready() {
      return ready;
    },

    load(url) {
      origin = new URL(url).origin;
      ready = false;
      clearReadyTimer();
      readyTimer = clock.setTimeout(() => {
        readyTimer = null;
        link.emit({ type: "error", reason: "not-ready", message: `${source.name} did not load in time.` });
      }, readyTimeoutMs);
      frame.load(url);
    },

    post(message) {
      if (ready && origin) frame.post(message, origin);
    },

    probe(message) {
      if (origin) frame.post(message, origin);
    },

    emit(event) {
      if (event.type === "ready") ready = true;
      if (event.type === "ready" || sourceFailed(event)) clearReadyTimer();
      for (const listener of [...listeners]) listener(event);
    },

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    destroy() {
      clearReadyTimer();
      stopListening();
      listeners.clear();
    },
  };
  return link;
}
