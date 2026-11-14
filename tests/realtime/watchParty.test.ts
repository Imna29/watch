import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import { createHarness, SECOND, syncableSourcesUnderTest, type Harness, type TestDevice } from "./harness";

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };
const SEVERANCE = { contentType: WatchPlaylistItemType.TV_SHOW, tmdbId: 95396, name: "Severance" };

/** How finely `watch` looks. */
const STEP_MS = 50;

/**
 * Advances `ms`, looking at each of `reads` every `STEP_MS`, and returns
 * what each one showed: its first value, then every change, with the time
 * it was first seen.
 */
function watch<R extends Record<string, unknown>>(h: Harness, ms: number, reads: { [K in keyof R]: () => R[K] }) {
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

describe.each(syncableSourcesUnderTest())("a Watch Party on %s", (source) => {
  function setUp() {
    return createHarness({ syncableSource: source });
  }

  describe("the invite", () => {
    it("reaches every device of the other Viewer", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariamLaptop = h.device("mariam");
      const mariamPhone = h.device("mariam");
      h.advance(SECOND);

      giorgi.watchParty.start(DUNE, null);
      h.advance(SECOND);

      for (const mariam of [mariamLaptop, mariamPhone]) {
        expect(mariam.watchParty.invite).toMatchObject({ starter: "giorgi", title: DUNE, episode: null });
      }
      expect(giorgi.watchParty.invite).toBeNull();
    });

    it("waits for a Viewer who opens the site later", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(10 * SECOND);

      const mariam = h.device("mariam");
      h.advance(SECOND);
      expect(mariam.watchParty.invite).toMatchObject({ starter: "giorgi", title: DUNE });
    });
  });

  describe("the starter", () => {
    it("waits at 0:00 for the other Viewer", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      h.device("mariam");
      h.advance(SECOND);

      giorgi.watchParty.start(DUNE, null);
      h.advance(30 * SECOND);

      expect(giorgi.player).toMatchObject({
        sourceId: source,
        playable: { kind: "movie", tmdbId: DUNE.tmdbId },
        paused: true,
      });
      expect(giorgi.player?.position).toBeLessThan(0.5);
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");
    });

    it("can cancel, which ends the Watch Party for both Viewers", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);

      giorgi.watchParty.cancel();
      h.advance(SECOND);

      expect(giorgi.player).toBeNull();
      expect(mariam.watchParty.invite).toBeNull();
      expect(mariam.watchParty.ended).toMatchObject({ title: DUNE, reason: "cancelled", by: "giorgi" });
      expect(giorgi.watchParty.ended).toBeNull(); // Giorgi knows: he pressed Cancel.

      const later = h.device("mariam");
      h.advance(SECOND);
      expect(later.watchParty.invite).toBeNull();
    });
  });

  describe("joining", () => {
    it("counts both Viewers down 3-2-1, then starts both players from 0:00 at the same moment", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam", { delayMs: 150, clockSkewMs: 4 * SECOND });
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);

      mariam.watchParty.join();
      const seen = watch(h, 10 * SECOND, {
        giorgiCountdown: () => giorgi.partySync?.view.countdown ?? null,
        mariamCountdown: () => mariam.partySync?.view.countdown ?? null,
        giorgiPlaying: () => giorgi.player?.paused === false,
        mariamPlaying: () => mariam.player?.paused === false,
      });

      expect(seen.giorgiCountdown.map(({ value }) => value)).toEqual([null, 3, 2, 1, null]);
      expect(seen.mariamCountdown.map(({ value }) => value)).toEqual([null, 3, 2, 1, null]);
      // "2", "1" and the start happen at the same moment on both devices.
      expect(seen.mariamCountdown.slice(2).map(({ at }) => at)).toEqual(seen.giorgiCountdown.slice(2).map(({ at }) => at));
      expect(seen.giorgiPlaying.map(({ value }) => value)).toEqual([false, true]);
      expect(seen.mariamPlaying.map(({ value }) => value)).toEqual([false, true]);
      expect(seen.mariamPlaying[1]?.at).toBe(seen.giorgiPlaying[1]?.at);
      expect(seen.giorgiPlaying[1]?.at).toBe(seen.giorgiCountdown[4]?.at);

      const startedAt = seen.giorgiPlaying[1]!.at;
      const secondsIn = (h.clock.now() - startedAt) / SECOND;
      expect(giorgi.player?.position).toBeCloseTo(secondsIn, 1);
      expect(mariam.player?.position).toBeCloseTo(secondsIn, 1);
    });

    it("counts down only once the joining Viewer's player has loaded", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam", { player: { loadMs: 8 * SECOND } });
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);

      mariam.watchParty.join();
      h.advance(5 * SECOND);
      expect(giorgi.partySync?.view).toMatchObject({ gettingReady: true, countdown: null, waitingFor: null });
      expect(mariam.partySync?.view).toMatchObject({ gettingReady: true, countdown: null });
      expect(giorgi.player).toMatchObject({ paused: true, position: 0 });

      h.advance(10 * SECOND);
      expect(giorgi.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
      expect(giorgi.player!.position).toBeLessThan(5);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 1);
    });

    it("takes the first of the invited Viewer's devices to join, and only that one", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const laptop = h.device("mariam");
      const phone = h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(SECOND);

      phone.watchParty.join();
      laptop.watchParty.join();
      h.advance(15 * SECOND);

      expect(phone.player?.paused).toBe(false);
      expect(laptop.player).toBeNull();
      expect(laptop.watchParty.invite).toBeNull();
    });
  });

  describe("starting while another Watch Party exists", () => {
    it("offers to join the one that exists", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(SECOND);

      mariam.watchParty.start(SEVERANCE, { season: 1, episode: 1 });
      h.advance(SECOND);
      expect(mariam.watchParty.choice).toMatchObject({ existing: { starter: "giorgi", title: DUNE }, canJoin: true });
      expect(mariam.player).toBeNull();
      expect(giorgi.watchParty.invite).toBeNull();

      mariam.watchParty.join();
      h.advance(15 * SECOND);
      expect(mariam.watchParty.choice).toBeNull();
      expect(mariam.player).toMatchObject({ playable: { kind: "movie", tmdbId: DUNE.tmdbId }, paused: false });
      expect(giorgi.player?.paused).toBe(false);
    });

    it("can replace it, which ends it and sends a new invite", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);
      mariam.watchParty.start(SEVERANCE, { season: 1, episode: 2 });
      h.advance(SECOND);

      mariam.watchParty.replace();
      h.advance(5 * SECOND);

      expect(giorgi.player).toBeNull();
      expect(giorgi.watchParty.ended).toMatchObject({ title: DUNE, reason: "replaced", by: "mariam" });
      expect(giorgi.watchParty.invite).toMatchObject({
        starter: "mariam",
        title: SEVERANCE,
        episode: { season: 1, episode: 2 },
      });
      expect(mariam.watchParty.choice).toBeNull();
      expect(mariam.player).toMatchObject({
        playable: { kind: "episode", tmdbId: SEVERANCE.tmdbId, season: 1, episode: 2 },
        paused: true,
        position: 0,
      });
      expect(mariam.partySync?.view.waitingFor).toBe("giorgi");
    });
  });

  describe("moving to another device", () => {
    /** Giorgi and Mariam (on `mariam`) watch Dune together for `ms`. */
    function watchingTogether(h: Harness, giorgi: TestDevice, mariam: TestDevice, ms = 60 * SECOND) {
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);
      mariam.watchParty.join();
      h.advance(ms);
      expect(giorgi.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
    }

    it("takes the Watch Party over on the device the Viewer joins from, at the shared position", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const laptop = h.device("mariam");
      const phone = h.device("mariam");
      h.advance(SECOND);
      watchingTogether(h, giorgi, laptop);
      expect(phone.player).toBeNull();

      phone.watchParty.join();
      h.advance(5 * SECOND);

      expect(laptop.player).toBeNull();
      expect(laptop.watchParty.continuedElsewhere).toBe(true);
      expect(phone.watchParty.continuedElsewhere).toBe(false);
      expect(phone.player).toMatchObject({ playable: { kind: "movie", tmdbId: DUNE.tmdbId }, paused: false });
      expect(phone.player!.position).toBeGreaterThan(60);
      expect(phone.player!.position).toBeCloseTo(giorgi.player!.position, 0);
    });

    it("interrupts the other Viewer's playback at most by a brief resync", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const laptop = h.device("mariam");
      const phone = h.device("mariam", { player: { loadMs: 4 * SECOND } });
      h.advance(SECOND);
      watchingTogether(h, giorgi, laptop);
      const before = giorgi.player!.position;

      phone.watchParty.join();
      h.advance(10 * SECOND);

      // Giorgi watched on, losing at most a couple of seconds to a resync.
      expect(giorgi.player!.position - before).toBeGreaterThan(8);
      expect(giorgi.player?.paused).toBe(false);
      expect(phone.player?.paused).toBe(false);
      expect(phone.player!.position).toBeCloseTo(giorgi.player!.position, 0);
    });

    it("ignores what the device it moved away from still sends", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const laptop = h.device("mariam", { delayMs: 2 * SECOND });
      const phone = h.device("mariam");
      h.advance(5 * SECOND);
      watchingTogether(h, giorgi, laptop);

      phone.watchParty.join();
      h.advance(SECOND);
      // The laptop has not heard yet that the phone took over, and Mariam closes the player there.
      expect(laptop.player?.paused).toBe(false);
      laptop.watchParty.cancel();
      h.advance(10 * SECOND);

      expect(giorgi.watchParty.ended).toBeNull();
      expect(giorgi.player?.paused).toBe(false);
      expect(phone.player?.paused).toBe(false);
      expect(phone.player!.position).toBeCloseTo(giorgi.player!.position, 0);
      expect(laptop.player).toBeNull();
      expect(laptop.watchParty.continuedElsewhere).toBe(true);
    });

    it("ignores the player of the device it moved away from, even when it reports in late", () => {
      const h = setUp();
      const laptop = h.device("giorgi", { delayMs: 2 * SECOND, player: { loadMs: 3 * SECOND } });
      const phone = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(5 * SECOND);
      laptop.watchParty.start(DUNE, null);
      h.advance(8 * SECOND); // The laptop's player has just loaded; the server has yet to hear it.
      phone.watchParty.join();
      h.advance(3 * SECOND); // Now it has, after the phone took over.
      laptop.watchParty.join(); // Back to the laptop, which loads its player again.
      h.advance(3 * SECOND);

      mariam.watchParty.join();
      h.advance(4 * SECOND);
      expect(mariam.partySync?.view).toMatchObject({ player: "ready", gettingReady: true, countdown: null });

      h.advance(12 * SECOND);
      expect(laptop.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
      expect(laptop.player!.position).toBeLessThan(10);
      expect(mariam.player!.position).toBeCloseTo(laptop.player!.position, 1);
    });

    it("can switch back to the first device", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const laptop = h.device("mariam");
      const phone = h.device("mariam");
      h.advance(SECOND);
      watchingTogether(h, giorgi, laptop);
      phone.watchParty.join();
      h.advance(30 * SECOND);

      laptop.watchParty.join();
      h.advance(5 * SECOND);

      expect(phone.player).toBeNull();
      expect(phone.watchParty.continuedElsewhere).toBe(true);
      expect(laptop.watchParty.continuedElsewhere).toBe(false);
      expect(laptop.player?.paused).toBe(false);
      expect(laptop.player!.position).toBeGreaterThan(90);
      expect(laptop.player!.position).toBeCloseTo(giorgi.player!.position, 0);
    });

    it("counts down only once the player of the device switched back to has loaded again", () => {
      const h = setUp();
      const laptop = h.device("giorgi", { player: { loadMs: 8 * SECOND } });
      const phone = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(SECOND);
      laptop.watchParty.start(DUNE, null);
      h.advance(10 * SECOND); // The laptop's player has loaded.
      phone.watchParty.join();
      h.advance(SECOND);
      laptop.watchParty.join(); // Back to the laptop, which loads its player again.
      h.advance(SECOND);

      mariam.watchParty.join();
      h.advance(4 * SECOND);
      expect(mariam.partySync?.view).toMatchObject({ player: "ready", gettingReady: true, countdown: null });
      expect(mariam.player?.paused).toBe(true);

      h.advance(8 * SECOND);
      expect(laptop.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
      expect(laptop.player!.position).toBeLessThan(5);
      expect(mariam.player!.position).toBeCloseTo(laptop.player!.position, 1);
    });
  });

  describe("the Source's player", () => {
    it("is not fooled by messages from origins the Source catalog does not list", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam", { player: { loadMs: 8 * SECOND } });
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);
      mariam.watchParty.join();
      h.advance(2 * SECOND);

      mariam.player!.postReadyFrom("https://ads.example");
      h.advance(4 * SECOND);
      expect(mariam.partySync?.view).toMatchObject({ player: "loading", gettingReady: true, countdown: null });
      expect(giorgi.partySync?.view).toMatchObject({ gettingReady: true, countdown: null });
    });

    it("is reported as failed when it does not load the Title in time", () => {
      const h = setUp();
      const giorgi = h.device("giorgi", { player: { unavailable: true } });
      h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);

      h.advance(10 * SECOND);
      expect(giorgi.partySync?.view.player).toBe("loading");
      h.advance(20 * SECOND);
      expect(giorgi.partySync?.view.player).toBe("failed");
    });
  });

  describe("History", () => {
    it("records a movie for both Viewers once the other Viewer joins", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);
      expect(h.history.recorded).toEqual([]);

      mariam.watchParty.join();
      h.advance(15 * SECOND);
      expect(h.history.recorded).toEqual([
        { viewer: "giorgi", title: DUNE, episode: null },
        { viewer: "mariam", title: DUNE, episode: null },
      ]);
    });

    it("records an episode, with episode progress, for both Viewers", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(SECOND);
      mariam.watchParty.start(SEVERANCE, { season: 2, episode: 3 });
      h.advance(5 * SECOND);

      giorgi.watchParty.join();
      h.advance(15 * SECOND);
      expect(h.history.recorded).toEqual([
        { viewer: "giorgi", title: SEVERANCE, episode: { season: 2, episode: 3 } },
        { viewer: "mariam", title: SEVERANCE, episode: { season: 2, episode: 3 } },
      ]);
    });

    it("records nothing when the Watch Party ends before the other Viewer joins", () => {
      const h = setUp();
      const giorgi = h.device("giorgi");
      h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);

      giorgi.watchParty.cancel();
      h.advance(5 * SECOND);
      expect(h.history.recorded).toEqual([]);
    });
  });
});
