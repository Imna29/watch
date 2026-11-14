import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import { describeChange } from "../../realtime/watchParty/changeMessage";
import { getSource } from "../../utils/sources";
import { createHarness, SECOND, syncableSourcesUnderTest, type TestDevice } from "./harness";
import type { FakePlayerOptions } from "./harness/fakeSourcePlayers";

const MINUTE = 60 * SECOND;

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };

/** The change message `device` shows over the player ("Mariam switched to VidFast"); null when none. */
function message(device: TestDevice) {
  const change = device.partySync?.view.lastChange;
  return change ? describeChange(change) : null;
}

describe.each(syncableSourcesUnderTest())("Syncable Sources in a Watch Party on %s", (source) => {
  /** The Syncable Source the Watch Party goes on to after `source`. */
  const next = syncableSourcesUnderTest().find((other) => other !== source)!;

  /** Giorgi starts Dune on `source`, with `next` after it, and Mariam joins. */
  function together({ giorgi: giorgiPlayer, mariam: mariamPlayer }: Partial<Record<"giorgi" | "mariam", FakePlayerOptions>> = {}) {
    const h = createHarness({ syncableSource: source, fallbackSources: [next] });
    const giorgi = h.device("giorgi", { player: giorgiPlayer });
    const mariam = h.device("mariam", { player: mariamPlayer });
    h.advance(SECOND);
    giorgi.watchParty.start(DUNE, null);
    h.advance(5 * SECOND);
    mariam.watchParty.join();
    return { h, giorgi, mariam };
  }

  describe("when the Source cannot play the Title", () => {
    it("offers both Viewers the next Syncable Source, even when it failed on one Viewer's device only", () => {
      const { h, giorgi, mariam } = together({ mariam: { unavailable: [source] } });
      h.advance(25 * SECOND);

      expect(mariam.partySync?.view.player).toBe("failed");
      for (const device of [giorgi, mariam]) {
        expect(device.watchParty.party).toMatchObject({ source, fallback: { kind: "source", source: next } });
      }
      expect(giorgi.partySync?.view.countdown).toBeNull();
      expect(giorgi.player?.paused).toBe(true);
    });

    it("moves both players to the next Syncable Source when a Viewer takes it, and starts them together", () => {
      const { h, giorgi, mariam } = together({ mariam: { unavailable: [source] } });
      h.advance(25 * SECOND);

      giorgi.watchParty.switchSource(next);
      h.advance(SECOND);
      expect(message(mariam)).toBe(`Giorgi switched to ${getSource(next).name}`);
      h.advance(10 * SECOND);

      for (const device of [giorgi, mariam]) {
        expect(device.watchParty.party).toMatchObject({ source: next, fallback: null });
        expect(device.player).toMatchObject({ sourceId: next, paused: false });
      }
      expect(giorgi.player!.position).toBeLessThan(10);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 1);
    });

    it("offers both Viewers Tab Share once no Syncable Source is left", () => {
      const { h, giorgi, mariam } = together({ giorgi: { unavailable: [next] }, mariam: { unavailable: [source] } });
      h.advance(25 * SECOND);
      mariam.watchParty.switchSource(next);
      h.advance(25 * SECOND);

      for (const device of [giorgi, mariam]) {
        expect(device.watchParty.party).toMatchObject({
          source: next,
          mode: "syncable-source",
          failedSources: [source, next],
          fallback: { kind: "tab-share" },
        });
      }
      expect(giorgi.partySync?.view.player).toBe("failed");
      expect(mariam.player?.paused).toBe(true);
    });
  });

  describe("switching Source", () => {
    it("moves both players to the new Source at the current position, and both go on playing together", () => {
      const { h, giorgi, mariam } = together();
      h.advance(MINUTE);
      expect(giorgi.player?.paused).toBe(false);
      const position = giorgi.player!.position;

      mariam.watchParty.switchSource(next);
      h.advance(SECOND);
      expect(message(giorgi)).toBe(`Mariam switched to ${getSource(next).name}`);
      for (const device of [giorgi, mariam]) {
        expect(device.player).toMatchObject({ sourceId: next, paused: true });
        expect(device.player!.position).toBeCloseTo(position, 0);
      }

      h.advance(10 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.player).toMatchObject({ sourceId: next, paused: false });
      }
      expect(giorgi.player!.position).toBeGreaterThan(position + 2);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 1);
    });

    it("while paused moves both players there, and both stay paused", () => {
      const { h, giorgi, mariam } = together();
      h.advance(MINUTE);
      giorgi.player!.controls.pause();
      h.advance(SECOND);
      const position = giorgi.player!.position;

      giorgi.watchParty.switchSource(next);
      h.advance(30 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.player).toMatchObject({ sourceId: next, ready: true, paused: true });
        expect(device.player!.position).toBeCloseTo(position, 0);
      }

      mariam.player!.controls.play();
      h.advance(10 * SECOND);
      expect(giorgi.player?.paused).toBe(false);
      expect(giorgi.player!.position).toBeCloseTo(mariam.player!.position, 0);
    });

    it("waits for both players to load the new Source, even when one only now reports the old one", () => {
      const h = createHarness({ syncableSource: source, fallbackSources: [next] });
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam", { delayMs: 2 * SECOND, player: { loadMs: 4 * SECOND } });
      h.advance(5 * SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);
      mariam.watchParty.join();
      // Mariam's player has just loaded on the first Source; the server hears it only after the switch below.
      h.advance(9 * SECOND);
      expect(mariam.player).toMatchObject({ ready: true, sourceId: source });
      giorgi.watchParty.switchSource(next);

      for (let waited = 0; waited < 30 * SECOND && !(giorgi.player!.position > 0.5); waited += 50) h.advance(50);
      expect(giorgi.player).toMatchObject({ sourceId: next, paused: false });
      expect(mariam.player).toMatchObject({ sourceId: next, ready: true, paused: false });
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 1);
    });
  });
});
