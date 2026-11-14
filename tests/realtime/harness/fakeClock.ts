import type { Clock, TimerId } from "../../../realtime/clock";

export interface FakeClock extends Clock {
  /** Moves time forward, running every timer that falls due on the way, in order. */
  advance(ms: number): void;
  /** The same timeline, read by a device whose own clock is `skewMs` ahead (negative: behind). */
  skewed(skewMs: number): Clock;
}

interface Timer {
  id: number;
  due: number;
  callback: () => void;
}

export function createFakeClock(start = Date.UTC(2026, 10, 14, 20, 0, 0)): FakeClock {
  let time = start;
  let nextId = 1;
  // Kept sorted by due time; timers due at the same time run in the order they were set.
  let timers: Timer[] = [];

  const clock: FakeClock = {
    now: () => time,

    setTimeout(callback, ms) {
      const timer = { id: nextId++, due: time + Math.max(0, ms), callback };
      const index = timers.findIndex((other) => other.due > timer.due);
      if (index === -1) timers.push(timer);
      else timers.splice(index, 0, timer);
      return timer.id;
    },

    clearTimeout(id: TimerId) {
      timers = timers.filter((timer) => timer.id !== id);
    },

    advance(ms) {
      const until = time + ms;
      for (;;) {
        const next = timers[0];
        if (!next || next.due > until) break;
        timers.shift();
        time = next.due;
        next.callback();
      }
      time = until;
    },

    skewed(skewMs) {
      return {
        now: () => time + skewMs,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
      };
    },
  };
  return clock;
}
