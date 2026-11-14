/** A timer handle from `Clock.setTimeout`; only meaningful to the same clock. */
export type TimerId = unknown;

/**
 * Time and timers, injected so tests can run the realtime system on a fake
 * clock they advance by hand.
 */
export interface Clock {
  /** Milliseconds since the epoch. */
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerId;
  clearTimeout(timer: TimerId): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
};
