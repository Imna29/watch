import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import { createHarness, SECOND, syncableSourcesUnderTest, type Harness, type TestDevice } from "./harness";
import type { FakePlayerOptions } from "./harness/fakeSourcePlayers";

const MINUTE = 60 * SECOND;

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };

/** How finely `track` looks. */
const STEP_MS = 50;

/**
 * Advances `ms`, looking at each of `reads` every `STEP_MS`, and returns the
 * values each one showed, in order, without repeats.
 */
function track<R extends Record<string, unknown>>(h: Harness, ms: number, reads: { [K in keyof R]: () => R[K] }) {
  const seen = {} as { [K in keyof R]: R[K][] };
  const look = () => {
    for (const key of Object.keys(reads) as (keyof R)[]) {
      const value = reads[key]();
      const values = (seen[key] ??= []);
      if (values.length === 0 || values.at(-1) !== value) values.push(value);
    }
  };
  look();
  for (let waited = 0; waited < ms; waited += STEP_MS) {
    h.advance(STEP_MS);
    look();
  }
  return seen;
}

/** How far `a`'s player is from `b`'s, in seconds. */
function apart(a: TestDevice, b: TestDevice) {
  return Math.abs(a.player!.position - b.player!.position);
}

describe.each(syncableSourcesUnderTest())("keeping a Watch Party in step on %s", (source) => {
  /** Giorgi starts Dune, Mariam joins, and they watch a minute of it together. */
  function watchingTogether({ giorgi: giorgiPlayer, mariam: mariamPlayer }: Record<string, FakePlayerOptions> = {}) {
    const h = createHarness({ syncableSource: source });
    const giorgi = h.device("giorgi", { player: giorgiPlayer });
    const mariam = h.device("mariam", { player: mariamPlayer });
    h.advance(SECOND);
    giorgi.watchParty.start(DUNE, null);
    h.advance(SECOND);
    mariam.watchParty.join();
    h.advance(MINUTE);
    expect(giorgi.player?.paused).toBe(false);
    expect(mariam.player?.paused).toBe(false);
    expect(apart(giorgi, mariam)).toBeLessThan(0.5);
    return { h, giorgi, mariam };
  }

  describe("a small drift", () => {
    it("is corrected quietly: the Viewer who fell behind moves forward, and nobody is paused", () => {
      const { h, giorgi, mariam } = watchingTogether();

      // Mariam's stream stalls for a moment, and she falls a second behind.
      mariam.player!.stall(SECOND);
      const seen = track(h, 10 * SECOND, {
        giorgiPaused: () => giorgi.player!.paused,
        mariamPaused: () => mariam.player!.paused,
        waitingFor: () => giorgi.partySync!.view.waitingFor ?? mariam.partySync!.view.waitingFor,
      });

      expect(seen).toEqual({ giorgiPaused: [false], mariamPaused: [false], waitingFor: [null] });
      expect(apart(giorgi, mariam)).toBeLessThan(0.5);
    });

    it("under half a second is left alone", () => {
      const { h, giorgi, mariam } = watchingTogether();

      mariam.player!.stall(300);
      h.advance(10 * SECOND);

      expect(giorgi.player!.position - mariam.player!.position).toBeCloseTo(0.3, 1);
    });
  });
});
