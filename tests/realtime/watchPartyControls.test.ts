import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import type { Episode } from "../../realtime/watchParty/protocol";
import type { TitleRef } from "../../realtime/presence/protocol";
import { describeChange } from "../../realtime/watchParty/changeMessage";
import { createHarness, SECOND, sourceCanSetRate, syncableSourcesUnderTest, type TestDevice } from "./harness";
import type { FakePlayerOptions } from "./harness/fakeSourcePlayers";

const MINUTE = 60 * SECOND;

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };

describe.each(syncableSourcesUnderTest())("shared controls in a Watch Party on %s", (source) => {
  /** Giorgi starts `title`, Mariam joins, and they watch a minute of it together. */
  function watchingTogether({
    title = DUNE,
    episode = null,
    player,
  }: { title?: TitleRef; episode?: Episode | null; player?: FakePlayerOptions } = {}) {
    const h = createHarness({ syncableSource: source });
    const giorgi = h.device("giorgi", { player });
    const mariam = h.device("mariam", { player });
    h.advance(SECOND);
    giorgi.watchParty.start(title, episode);
    h.advance(SECOND);
    mariam.watchParty.join();
    h.advance(MINUTE);
    expect(giorgi.player?.paused).toBe(false);
    expect(mariam.player?.paused).toBe(false);
    return { h, giorgi, mariam };
  }

  describe("pause", () => {
    it("pressed in either player pauses both, at the same position", () => {
      const { h, giorgi, mariam } = watchingTogether();

      mariam.player!.controls.pause();
      h.advance(SECOND);
      expect(mariam.player?.paused).toBe(true);
      expect(giorgi.player?.paused).toBe(true);
      expect(giorgi.player!.position).toBeCloseTo(mariam.player!.position, 0);

      h.advance(10 * SECOND);
      expect(mariam.player?.paused).toBe(true);
      expect(giorgi.player?.paused).toBe(true);
    });
  });

  describe("play", () => {
    it("pressed in either player resumes both, from the same position", () => {
      const { h, giorgi, mariam } = watchingTogether();
      giorgi.player!.controls.pause();
      h.advance(5 * SECOND);
      const pausedAt = giorgi.player!.position;

      mariam.player!.controls.play();
      h.advance(SECOND);
      expect(mariam.player?.paused).toBe(false);
      expect(giorgi.player?.paused).toBe(false);

      h.advance(30 * SECOND);
      expect(giorgi.player?.paused).toBe(false);
      expect(giorgi.player!.position).toBeCloseTo(pausedAt + 31, 0);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 0);
    });
  });

  describe("seek", () => {
    it("in either player moves both to the same position, still playing", () => {
      const { h, giorgi, mariam } = watchingTogether();

      giorgi.player!.controls.seek(40 * MINUTE / SECOND);
      h.advance(SECOND);
      expect(giorgi.player!.position).toBeCloseTo(2401, 0);
      expect(mariam.player!.position).toBeCloseTo(2401, 0);

      h.advance(10 * SECOND);
      expect(giorgi.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 0);
      expect(giorgi.player!.position).toBeCloseTo(2411, 0);
    });

    it("while paused moves both, and both stay paused", () => {
      const { h, giorgi, mariam } = watchingTogether();
      giorgi.player!.controls.pause();
      h.advance(SECOND);

      mariam.player!.controls.seek(10);
      h.advance(10 * SECOND);
      expect(giorgi.player).toMatchObject({ paused: true, position: 10 });
      expect(mariam.player).toMatchObject({ paused: true, position: 10 });
    });
  });

  describe("speed", () => {
    it.runIf(sourceCanSetRate(source))("chosen in either player applies to both", () => {
      const { h, giorgi, mariam } = watchingTogether();
      const before = giorgi.player!.position;

      mariam.player!.controls.setSpeed(1.5);
      h.advance(20 * SECOND);
      expect(giorgi.player?.rate).toBe(1.5);
      expect(mariam.player?.rate).toBe(1.5);
      expect(giorgi.player!.position).toBeCloseTo(before + 30, 0);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 0);
    });
  });

  describe("the change message", () => {
    /** The change message `device` shows over the player; null when none. */
    function message(device: TestDevice) {
      const change = device.partySync?.view.lastChange;
      return change ? describeChange(change) : null;
    }

    it("tells the other Viewer who did what, and where", () => {
      const { h, giorgi, mariam } = watchingTogether();

      mariam.player!.controls.seek(3734);
      h.advance(SECOND);
      expect(message(giorgi)).toBe("Mariam jumped to 1:02:14");
      expect(message(mariam)).toBeNull();

      mariam.player!.controls.pause();
      h.advance(SECOND);
      expect(message(giorgi)).toBe("Mariam paused at 1:02:15");

      giorgi.player!.controls.play();
      h.advance(SECOND);
      expect(message(mariam)).toBe("Giorgi resumed at 1:02:15");
      expect(message(giorgi)).toBe("Mariam paused at 1:02:15");

      giorgi.player!.controls.seek(65);
      h.advance(SECOND);
      expect(message(mariam)).toBe("Giorgi jumped to 1:05");
    });

    it.runIf(sourceCanSetRate(source))("tells the other Viewer about a new speed", () => {
      const { h, giorgi, mariam } = watchingTogether();

      giorgi.player!.controls.setSpeed(1.25);
      h.advance(SECOND);
      expect(message(mariam)).toBe("Giorgi changed the speed to 1.25×");
    });

    it("goes away after a few seconds", () => {
      const { h, giorgi, mariam } = watchingTogether();
      mariam.player!.controls.pause();
      h.advance(SECOND);
      expect(message(giorgi)).not.toBeNull();

      h.advance(10 * SECOND);
      expect(message(giorgi)).toBeNull();
    });
  });

  describe("commands a player carries out for the shared state", () => {
    it("are never sent back as changes, however long the players take to seek", () => {
      const { h, giorgi, mariam } = watchingTogether({ player: { seekMs: 1500 } });
      const changes = () => giorgi.watchParty.party!.seq;
      const before = changes();

      giorgi.player!.controls.seek(2400);
      h.advance(30 * SECOND);
      expect(changes()).toBe(before + 1);

      mariam.player!.controls.pause();
      h.advance(10 * SECOND);
      expect(changes()).toBe(before + 2);

      mariam.player!.controls.seek(600);
      h.advance(10 * SECOND);
      expect(changes()).toBe(before + 3);

      giorgi.player!.controls.play();
      h.advance(30 * SECOND);
      expect(changes()).toBe(before + 4);
      expect(giorgi.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
      expect(giorgi.player!.position).toBeCloseTo(630, 0);
    });

    it("are never sent back when two changes reach a player at once", () => {
      const { h, giorgi, mariam } = watchingTogether();
      const changes = () => mariam.watchParty.party!.seq;
      const before = changes();

      giorgi.player!.controls.pause();
      giorgi.player!.controls.play();
      h.advance(10 * SECOND);
      expect(changes()).toBe(before + 2);
      expect(giorgi.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
    });
  });

  describe("a shared state that arrives after a newer one", () => {
    it("is ignored", () => {
      const { h, giorgi, mariam } = watchingTogether();

      mariam.setDelay(2 * SECOND);
      giorgi.player!.controls.pause();
      h.advance(100);
      // Mariam's network speeds up: the state after the next change overtakes the paused one.
      mariam.setDelay(20);
      giorgi.player!.controls.play();
      h.advance(10 * SECOND);

      expect(giorgi.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 0);
      expect(mariam.watchParty.party).toEqual(giorgi.watchParty.party);
    });
  });

  describe("after another device of the Viewer took over", () => {
    it("a pause pressed on the device it moved away from changes nothing", () => {
      const h = createHarness({ syncableSource: source });
      const giorgi = h.device("giorgi");
      const laptop = h.device("mariam", { delayMs: 2 * SECOND });
      const phone = h.device("mariam");
      h.advance(5 * SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);
      laptop.watchParty.join();
      h.advance(MINUTE);

      phone.watchParty.join();
      h.advance(SECOND);
      // The laptop has not heard yet that the phone took over, and Mariam presses pause there.
      expect(laptop.player?.paused).toBe(false);
      const changes = giorgi.watchParty.party!.seq;
      laptop.player!.controls.pause();
      h.advance(10 * SECOND);

      expect(giorgi.watchParty.party).toMatchObject({ seq: changes, phase: { name: "playing" } });
      expect(giorgi.player?.paused).toBe(false);
      expect(phone.player?.paused).toBe(false);
      expect(phone.player!.position).toBeCloseTo(giorgi.player!.position, 0);
      expect(laptop.player).toBeNull();
    });

    it("the new device's player starting on its own does not resume a paused Watch Party", () => {
      const h = createHarness({ syncableSource: source });
      const giorgi = h.device("giorgi");
      const laptop = h.device("mariam");
      const phone = h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);
      laptop.watchParty.join();
      h.advance(MINUTE);
      giorgi.player!.controls.pause();
      h.advance(SECOND);
      const changes = giorgi.watchParty.party!.seq;

      phone.watchParty.join();
      h.advance(10 * SECOND);

      expect(phone.player?.ready).toBe(true);
      expect(phone.player?.paused).toBe(true);
      expect(giorgi.player?.paused).toBe(true);
      expect(phone.player!.position).toBeCloseTo(giorgi.player!.position, 0);
      expect(giorgi.watchParty.party).toMatchObject({ seq: changes + 1, phase: { name: "paused" } }); // + the takeover
    });
  });
});
