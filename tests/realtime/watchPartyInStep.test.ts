import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import type { TitleRef } from "../../realtime/presence/protocol";
import type { ShowEpisodes } from "../../realtime/watchParty/episodeGuide";
import type { Episode } from "../../realtime/watchParty/protocol";
import { createHarness, SECOND, syncableSourcesUnderTest, type Harness, type TestDevice } from "./harness";
import type { FakePlayerOptions } from "./harness/fakeSourcePlayers";

const MINUTE = 60 * SECOND;

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };
const SEVERANCE = { contentType: WatchPlaylistItemType.TV_SHOW, tmdbId: 95396, name: "Severance" };

/** Severance's first season, as TMDB lists it. */
const SEVERANCE_EPISODES: ShowEpisodes = {
  seasons: [{ season_number: 1, episode_count: 9 }],
  last_episode_to_air: { season_number: 1, episode_number: 9 },
};

/** How finely `track` looks. */
const STEP_MS = 50;

/**
 * Advances `ms`, looking at each of `reads` every `STEP_MS`, and returns
 * what each one showed: its first value, then every change, with the time
 * it was first seen.
 */
function track<R extends Record<string, unknown>>(h: Harness, ms: number, reads: { [K in keyof R]: () => R[K] }) {
  const seen = {} as { [K in keyof R]: { at: number; value: R[K] }[] };
  const look = () => {
    for (const key of Object.keys(reads) as (keyof R)[]) {
      const value = reads[key]();
      const changes = (seen[key] ??= []);
      if (changes.length === 0 || changes.at(-1)!.value !== value) changes.push({ at: h.clock.now(), value });
    }
  };
  look();
  for (let waited = 0; waited < ms; waited += STEP_MS) {
    h.advance(STEP_MS);
    look();
  }
  return seen;
}

/** The values `track` saw, without their times. */
function values<T>(changes: { value: T }[]) {
  return changes.map(({ value }) => value);
}

/** The biggest step `track` saw a position take between two looks, in seconds. */
function biggestJump(changes: { value: number }[]) {
  return Math.max(0, ...changes.slice(1).map(({ value }, i) => Math.abs(value - changes[i]!.value)));
}

/** How far `a`'s player is from `b`'s, in seconds. */
function apart(a: TestDevice, b: TestDevice) {
  return Math.abs(a.player!.position - b.player!.position);
}

describe.each(syncableSourcesUnderTest())("keeping a Watch Party in step on %s", (source) => {
  /** Giorgi starts `title` (Dune unless said), Mariam joins, and they watch a minute of it together. */
  function watchingTogether({
    giorgi: giorgiPlayer,
    mariam: mariamPlayer,
    title = DUNE,
    episode = null,
  }: { giorgi?: FakePlayerOptions; mariam?: FakePlayerOptions; title?: TitleRef; episode?: Episode | null } = {}) {
    const h = createHarness({ syncableSource: source, shows: { [SEVERANCE.tmdbId]: SEVERANCE_EPISODES } });
    const giorgi = h.device("giorgi", { player: giorgiPlayer });
    const mariam = h.device("mariam", { player: mariamPlayer });
    h.advance(SECOND);
    giorgi.watchParty.start(title, episode);
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

      expect(values(seen.giorgiPaused)).toEqual([false]);
      expect(values(seen.mariamPaused)).toEqual([false]);
      expect(values(seen.waitingFor)).toEqual([null]);
      expect(apart(giorgi, mariam)).toBeLessThan(0.5);
    });

    it("under half a second is left alone", () => {
      const { h, giorgi, mariam } = watchingTogether();

      mariam.player!.stall(300);
      h.advance(10 * SECOND);

      expect(giorgi.player!.position - mariam.player!.position).toBeCloseTo(0.3, 1);
    });
  });

  describe("a Viewer who falls further behind", () => {
    it("pauses both players with \"Waiting for Mariam…\", and both resume together once she caught up", () => {
      const { h, giorgi, mariam } = watchingTogether();
      const before = giorgi.player!.position;

      // Mariam's stream stalls for a while.
      mariam.player!.stall(6 * SECOND);
      h.advance(4 * SECOND);
      expect(giorgi.player?.paused).toBe(true);
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");
      expect(mariam.partySync?.view.waitingFor).toBe("mariam");
      const waitingAt = giorgi.player!.position;
      expect(waitingAt - before).toBeLessThan(3);

      const seen = track(h, 20 * SECOND, {
        giorgiPlaying: () => !giorgi.player!.paused,
        mariamPlaying: () => !mariam.player!.paused,
        giorgiPosition: () => giorgi.player!.position,
        mariamPosition: () => mariam.player!.position,
        waitingFor: () => giorgi.partySync!.view.waitingFor,
      });

      expect(values(seen.giorgiPlaying)).toEqual([false, true]);
      expect(values(seen.mariamPlaying).at(-1)).toBe(true);
      // Both start again at the same moment, from where Giorgi waited...
      expect(seen.mariamPlaying.at(-1)!.at).toBe(seen.giorgiPlaying.at(-1)!.at);
      expect(values(seen.waitingFor)).toEqual(["mariam", null]);
      expect(giorgi.player!.position).toBeGreaterThan(waitingAt + 5);
      expect(apart(giorgi, mariam)).toBeLessThan(0.5);
      // ...and nobody missed anything: neither player skipped ahead.
      expect(biggestJump(seen.giorgiPosition)).toBeLessThan(0.5);
      expect(biggestJump(seen.mariamPosition)).toBeLessThan(0.5);
    });
  });

  describe("a Viewer whose connection drops", () => {
    it("is waited for, with \"Waiting for Mariam…\", once she has been gone a few seconds", () => {
      const { h, giorgi, mariam } = watchingTogether();

      mariam.drop();
      // The server only notices once her device has gone silent, and then gives her a few seconds.
      h.advance(5 * SECOND);
      expect(giorgi.player?.paused).toBe(false);
      expect(giorgi.partySync?.view.waitingFor).toBeNull();

      h.advance(10 * SECOND);
      expect(giorgi.player?.paused).toBe(true);
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");

      const waitingAt = giorgi.player!.position;
      h.advance(MINUTE);
      expect(giorgi.player).toMatchObject({ paused: true, position: waitingAt });
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");
    });

    it("rejoins at the shared position once her connection is back, and both resume together", () => {
      const { h, giorgi, mariam } = watchingTogether();
      const player = mariam.player;
      mariam.drop();
      h.advance(20 * SECOND);
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");
      const waitingAt = giorgi.player!.position;

      mariam.restore();
      // Her device reconnects by itself.
      const seen = track(h, 30 * SECOND, {
        giorgiPlaying: () => !giorgi.player!.paused,
        mariamPlaying: () => !mariam.player!.paused,
        mariamPlayer: () => mariam.player,
      });

      // Her player stayed open all along, and took her back to where the Watch Party waited.
      expect(values(seen.mariamPlayer)).toEqual([player]);
      expect(values(seen.giorgiPlaying)).toEqual([false, true]);
      expect(seen.mariamPlaying.at(-1)).toEqual({ at: seen.giorgiPlaying.at(-1)!.at, value: true });
      expect(giorgi.partySync?.view.waitingFor).toBeNull();
      const resumedFor = (h.clock.now() - seen.giorgiPlaying.at(-1)!.at) / SECOND;
      expect(giorgi.player!.position).toBeCloseTo(waitingAt + resumedFor, 0);
      expect(apart(giorgi, mariam)).toBeLessThan(0.5);
    });
  });

  describe("the end of an episode", () => {
    it("makes nobody wait, however long the episode after it takes to look up", async () => {
      const { h, giorgi, mariam } = watchingTogether({ title: SEVERANCE, episode: { season: 1, episode: 1 } });

      giorgi.player!.controls.seek(giorgi.player!.duration - 10);
      // Both players reach the end; the lookup of the next episode has not answered yet.
      h.advance(11 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.player!.paused).toBe(true);
        expect(device.player!.position).toBeCloseTo(device.player!.duration, 1);
      }
      const atTheEnd = giorgi.watchParty.party;
      h.advance(20 * SECOND);
      // Stopped at the end is where they should be: nothing changes, and nobody is waited for.
      expect(giorgi.watchParty.party).toEqual(atTheEnd);
      expect(giorgi.partySync?.view.waitingFor).toBeNull();
      expect(mariam.partySync?.view.waitingFor).toBeNull();

      for (let waited = 0; waited < 5 * SECOND && !mariam.partySync?.view.nextEpisode; waited += 50) {
        await h.advanceAsync(50);
      }
      expect(giorgi.partySync?.view.nextEpisode?.episode).toEqual({ season: 1, episode: 2 });
      expect(mariam.partySync?.view.nextEpisode?.episode).toEqual({ season: 1, episode: 2 });
    });
  });

  describe("a Viewer who reloads the page", () => {
    it("rejoins at the shared position, and the other Viewer watches on", () => {
      const { h, giorgi, mariam } = watchingTogether();

      const reloaded = mariam.reload();
      const seen = track(h, 15 * SECOND, {
        giorgiPaused: () => giorgi.player!.paused,
        waitingFor: () => giorgi.partySync!.view.waitingFor,
      });

      expect(values(seen.giorgiPaused)).toEqual([false]);
      expect(values(seen.waitingFor)).toEqual([null]);
      expect(mariam.player).toBeNull();
      expect(reloaded.watchParty.activeHere).toBe(true);
      expect(reloaded.player?.paused).toBe(false);
      expect(apart(giorgi, reloaded)).toBeLessThan(0.5);
    });

    it("is waited for when the page takes a while, and both resume together from where she left", () => {
      const { h, giorgi, mariam } = watchingTogether();
      const leftAt = giorgi.player!.position;

      const reloaded = mariam.reload({ takesMs: 10 * SECOND });
      h.advance(8 * SECOND);
      expect(giorgi.player?.paused).toBe(true);
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");
      // Back to where she left (VidFast seeks to whole seconds).
      expect(Math.abs(giorgi.player!.position - leftAt)).toBeLessThan(1);
      const waitingAt = giorgi.player!.position;

      const seen = track(h, 20 * SECOND, {
        giorgiPlaying: () => !giorgi.player!.paused,
        mariamPlaying: () => reloaded.player?.paused === false,
      });
      expect(values(seen.giorgiPlaying)).toEqual([false, true]);
      expect(seen.mariamPlaying.at(-1)).toEqual({ at: seen.giorgiPlaying.at(-1)!.at, value: true });
      const resumedFor = (h.clock.now() - seen.giorgiPlaying.at(-1)!.at) / SECOND;
      expect(giorgi.player!.position).toBeCloseTo(waitingAt + resumedFor, 0);
      expect(apart(giorgi, reloaded)).toBeLessThan(0.5);
    });

    it("offers \"Click to resume\" when the browser will not start her player, and is waited for until she clicks", () => {
      const { h, giorgi, mariam } = watchingTogether();

      // After a reload the page has had no click yet, so the browser refuses to start the player with sound.
      const reloaded = mariam.reload({ player: { blocksPlayUntilClick: true } });
      h.advance(10 * SECOND);
      expect(reloaded.player?.paused).toBe(true);
      expect(reloaded.partySync?.view.clickToResume).toBe(true);
      expect(giorgi.player?.paused).toBe(true);
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");
      h.advance(MINUTE);
      expect(giorgi.player?.paused).toBe(true);

      reloaded.clickToResume();
      h.advance(10 * SECOND);
      expect(reloaded.partySync?.view.clickToResume).toBe(false);
      expect(giorgi.partySync?.view.waitingFor).toBeNull();
      expect(giorgi.player?.paused).toBe(false);
      expect(reloaded.player?.paused).toBe(false);
      expect(apart(giorgi, reloaded)).toBeLessThan(0.5);
    });

    it("does not offer \"Click to resume\" when the player merely does not start on its own", () => {
      const { h, giorgi, mariam } = watchingTogether();

      const reloaded = mariam.reload({ player: { noAutoplay: true } });
      h.advance(10 * SECOND);
      expect(reloaded.partySync?.view.clickToResume).toBe(false);
      expect(reloaded.player?.paused).toBe(false);
      expect(apart(giorgi, reloaded)).toBeLessThan(0.5);
    });
  });
});
