export interface ThrottlePolicy {
  /** Failures allowed before any wait. */
  freeFailures: number;
  /** Wait after the first failure beyond the free ones; doubles after each further failure. */
  firstDelayMs: number;
  /** The wait stops growing here. */
  maxDelayMs: number;
  /** Failures are forgotten after this long without a new one. */
  forgetAfterMs: number;
}

// Bounds memory when many addresses fail once and never come back.
const PRUNE_ABOVE_ENTRIES = 10_000;

/**
 * Counts failures per key in memory (the app runs as one server process) and
 * says how long the next attempt for a key must wait.
 */
export function createFailureThrottle(policy: ThrottlePolicy, now: () => number) {
  const entries = new Map<string, { failures: number; lastFailureAt: number }>();

  function isForgotten(entry: { lastFailureAt: number }) {
    return now() - entry.lastFailureAt >= policy.forgetAfterMs;
  }

  function current(key: string) {
    const entry = entries.get(key);
    if (entry && isForgotten(entry)) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function prune() {
    for (const [key, entry] of entries) {
      if (isForgotten(entry)) entries.delete(key);
    }
  }

  return {
    waitMs(key: string): number {
      const entry = current(key);
      if (!entry || entry.failures < policy.freeFailures) return 0;
      const delay = Math.min(
        policy.maxDelayMs,
        policy.firstDelayMs * 2 ** (entry.failures - policy.freeFailures),
      );
      return Math.max(0, entry.lastFailureAt + delay - now());
    },

    fail(key: string) {
      const failures = (current(key)?.failures ?? 0) + 1;
      entries.set(key, { failures, lastFailureAt: now() });
      if (entries.size > PRUNE_ABOVE_ENTRIES) prune();
    },

    /** Takes back one failure, e.g. one counted before a password check that then succeeded. */
    forgive(key: string) {
      const entry = current(key);
      if (entry) entry.failures = Math.max(0, entry.failures - 1);
    },

    clear(key: string) {
      entries.delete(key);
    },
  };
}
