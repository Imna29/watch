import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import { describeChange } from "../../realtime/watchParty/changeMessage";
import type { ShowEpisodes } from "../../realtime/watchParty/episodeGuide";
import type { Episode } from "../../realtime/watchParty/protocol";
import type { TitleRef } from "../../realtime/presence/protocol";
import { createHarness, SECOND, syncableSourcesUnderTest, type Harness, type TestDevice } from "./harness";
import { playerHasOwnEpisodeList } from "./harness/fakeSourcePlayers";

const MINUTE = 60 * SECOND;

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };
const SEVERANCE = { contentType: WatchPlaylistItemType.TV_SHOW, tmdbId: 95396, name: "Severance" };
const ARRIVAL = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 329865, name: "Arrival" };

/** Severance as TMDB lists it: two seasons out, a third announced. */
const SEVERANCE_EPISODES: ShowEpisodes = {
  seasons: [
    { season_number: 0, episode_count: 2 }, // Specials
    { season_number: 1, episode_count: 9 },
    { season_number: 2, episode_count: 10 },
    { season_number: 3, episode_count: 8 },
  ],
  last_episode_to_air: { season_number: 2, episode_number: 10 },
};

const S1E1 = { season: 1, episode: 1 };
const S1E2 = { season: 1, episode: 2 };

/** The change message `device` shows over the player ("Mariam paused at 1:02:14"); null when none. */
function message(device: TestDevice) {
  const change = device.partySync?.view.lastChange;
  return change ? describeChange(change) : null;
}

/** Advances in small steps, letting promises settle, until `done()` or `ms` have passed. */
async function until(h: Harness, done: () => boolean, ms = MINUTE) {
  for (let waited = 0; waited < ms && !done(); waited += 50) await h.advanceAsync(50);
  expect(done()).toBe(true);
}

describe.each(syncableSourcesUnderTest())("the end of a Title in a Watch Party on %s", (source) => {
  /** Giorgi starts `title` (at `episode`), Mariam joins, and they watch a minute of it together. */
  function watchingTogether(title: TitleRef, episode: Episode | null) {
    const h = createHarness({ syncableSource: source, shows: { [SEVERANCE.tmdbId]: SEVERANCE_EPISODES } });
    const giorgi = h.device("giorgi");
    const mariam = h.device("mariam");
    h.advance(SECOND);
    giorgi.watchParty.start(title, episode);
    h.advance(SECOND);
    mariam.watchParty.join();
    h.advance(MINUTE);
    expect(giorgi.player?.paused).toBe(false);
    expect(mariam.player?.paused).toBe(false);
    return { h, giorgi, mariam };
  }

  /** Giorgi skips to 10 seconds before the end, and both players play on to it. */
  async function playToTheEnd(h: Harness, giorgi: TestDevice, ended: () => boolean) {
    giorgi.player!.controls.seek(giorgi.player!.duration - 10);
    await until(h, ended);
  }

  describe("when an episode ends", () => {
    it("both Viewers see the next episode counting down from 10 seconds", async () => {
      const { h, giorgi, mariam } = watchingTogether(SEVERANCE, S1E1);

      await playToTheEnd(h, giorgi, () => !!giorgi.partySync?.view.nextEpisode);
      for (const device of [giorgi, mariam]) {
        expect(device.partySync?.view.nextEpisode).toEqual({ episode: S1E2, secondsLeft: 10 });
        expect(device.player?.paused).toBe(true);
      }
      // The players stopping at the end is nobody's pause.
      expect(message(mariam)).toBeNull();
      expect(message(giorgi)).toBeNull();

      await h.advanceAsync(3 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.partySync?.view.nextEpisode).toEqual({ episode: S1E2, secondsLeft: 7 });
      }
    });

    it("then both players load the next episode and play it together from the start", async () => {
      const { h, giorgi, mariam } = watchingTogether(SEVERANCE, S1E1);
      await playToTheEnd(h, giorgi, () => !!giorgi.partySync?.view.nextEpisode);
      const recorded = h.history.recorded.length;

      await until(h, () => giorgi.player?.playable.kind === "episode" && giorgi.player.playable.episode === 2, 15 * SECOND);
      await until(h, () => giorgi.player?.paused === false && mariam.player?.paused === false, 15 * SECOND);
      await h.advanceAsync(5 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.player?.playable).toEqual({ kind: "episode", tmdbId: SEVERANCE.tmdbId, ...S1E2 });
        expect(device.partySync?.view.nextEpisode).toBeNull();
      }
      expect(giorgi.player!.position).toBeGreaterThan(4);
      expect(giorgi.player!.position).toBeLessThan(6);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 1);
      expect(h.history.recorded.slice(recorded)).toEqual([
        { viewer: "giorgi", title: SEVERANCE, episode: S1E2 },
        { viewer: "mariam", title: SEVERANCE, episode: S1E2 },
      ]);
    });

    it("either Viewer can cancel the countdown, which cancels it for both", async () => {
      const { h, giorgi, mariam } = watchingTogether(SEVERANCE, S1E1);
      await playToTheEnd(h, giorgi, () => !!mariam.partySync?.view.nextEpisode);
      const recorded = h.history.recorded.length;

      mariam.watchParty.cancelNextEpisode();
      await h.advanceAsync(SECOND);
      expect(message(giorgi)).toBe("Mariam cancelled the next episode");

      await h.advanceAsync(30 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.partySync?.view.nextEpisode).toBeNull();
        expect(device.player).toMatchObject({ playable: { ...S1E1 }, paused: true });
        expect(device.player!.position).toBeCloseTo(device.player!.duration, 0);
      }
      expect(h.history.recorded.length).toBe(recorded);
    });
  });

  describe("another episode chosen in the Source's own player", () => {
    it.runIf(playerHasOwnEpisodeList(source))("moves both Viewers to it, never just one", async () => {
      const { h, giorgi, mariam } = watchingTogether(SEVERANCE, S1E1);

      mariam.player!.controls.chooseEpisode(S1E2);
      await h.advanceAsync(SECOND);
      expect(message(giorgi)).toBe("Mariam switched to S1E2");

      await until(h, () => giorgi.player?.paused === false && mariam.player?.paused === false, 15 * SECOND);
      await h.advanceAsync(5 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.player?.playable).toEqual({ kind: "episode", tmdbId: SEVERANCE.tmdbId, ...S1E2 });
      }
      expect(giorgi.player!.position).toBeLessThan(6);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 1);
    });
  });

  describe("after a season's last episode", () => {
    it("moves both Viewers to the first episode of the next season", async () => {
      const { h, giorgi, mariam } = watchingTogether(SEVERANCE, { season: 1, episode: 9 });

      await playToTheEnd(h, giorgi, () => !!mariam.partySync?.view.nextEpisode);
      expect(mariam.partySync?.view.nextEpisode?.episode).toEqual({ season: 2, episode: 1 });

      await until(h, () => giorgi.player?.paused === false && mariam.player?.paused === false, 30 * SECOND);
      for (const device of [giorgi, mariam]) {
        expect(device.player?.playable).toEqual({ kind: "episode", tmdbId: SEVERANCE.tmdbId, season: 2, episode: 1 });
      }
    });
  });

  describe("after the show's final episode", () => {
    it("ends the Watch Party for both Viewers, even with another season announced", async () => {
      const { h, giorgi, mariam } = watchingTogether(SEVERANCE, { season: 2, episode: 10 });

      await playToTheEnd(h, giorgi, () => giorgi.player === null && mariam.player === null);
      for (const device of [giorgi, mariam]) {
        expect(device.watchParty.ended).toMatchObject({ title: SEVERANCE, episode: { season: 2, episode: 10 }, reason: "finished" });
        expect(device.watchParty.party?.phase.name).toBe("ended");
      }
    });
  });

  describe("when a movie ends", () => {
    it("ends the Watch Party for both Viewers", async () => {
      const { h, giorgi, mariam } = watchingTogether(DUNE, null);

      await playToTheEnd(h, giorgi, () => giorgi.player === null && mariam.player === null);
      for (const device of [giorgi, mariam]) {
        expect(device.watchParty.ended).toMatchObject({ title: DUNE, reason: "finished" });
      }
      expect(mariam.watchParty.invite).toBeNull();
    });
  });

  describe("when one Viewer leaves", () => {
    /** Giorgi closes his player a minute into Dune. */
    function giorgiLeaves() {
      const watching = watchingTogether(DUNE, null);
      watching.giorgi.watchParty.leave();
      watching.h.advance(SECOND);
      return watching;
    }

    it("the other is asked whether to keep watching alone, and is not cut off meanwhile", () => {
      const { h, giorgi, mariam } = giorgiLeaves();

      expect(giorgi.player).toBeNull();
      expect(giorgi.watchParty.left).toBeNull();
      expect(mariam.watchParty.left).toMatchObject({ by: "giorgi", title: DUNE });
      expect(mariam.watchParty.ended).toBeNull();
      const position = mariam.player!.position;
      h.advance(10 * SECOND);
      expect(mariam.player?.paused).toBe(false);
      expect(mariam.player!.position).toBeCloseTo(position + 10, 0);
    });

    it("\"Keep watching alone\" continues solo from the same position", () => {
      const { h, giorgi, mariam } = giorgiLeaves();
      const player = mariam.player;
      const position = player!.position;

      mariam.watchParty.keepWatchingAlone();
      h.advance(30 * SECOND);
      expect(mariam.watchParty.left).toBeNull();
      expect(mariam.player).toBe(player);
      expect(mariam.player).toMatchObject({ paused: false, playable: { kind: "movie", tmdbId: DUNE.tmdbId } });
      expect(mariam.player!.position).toBeCloseTo(position + 30, 0);

      // Alone: pausing pauses only her player, and stays paused.
      const heard = giorgi.received.length;
      mariam.player!.controls.pause();
      h.advance(10 * SECOND);
      expect(mariam.player?.paused).toBe(true);
      expect(giorgi.received.slice(heard).filter(({ type }) => type.startsWith("watchParty"))).toEqual([]);
    });

    it("a new invite leaves the player watched alone as it is, until the Viewer joins", () => {
      const { h, giorgi, mariam } = giorgiLeaves();
      mariam.watchParty.keepWatchingAlone();
      h.advance(10 * SECOND);
      const player = mariam.player;
      const position = player!.position;

      giorgi.watchParty.start(ARRIVAL, null);
      h.advance(5 * SECOND);
      expect(mariam.watchParty.invite).toMatchObject({ starter: "giorgi", title: ARRIVAL });
      expect(mariam.player).toBe(player);
      expect(mariam.player).toMatchObject({ paused: false, playable: { tmdbId: DUNE.tmdbId } });
      expect(mariam.player!.position).toBeCloseTo(position + 5, 0);

      mariam.watchParty.join();
      h.advance(15 * SECOND);
      expect(mariam.player).toMatchObject({ paused: false, playable: { tmdbId: ARRIVAL.tmdbId } });
      expect(giorgi.player).toMatchObject({ paused: false, playable: { tmdbId: ARRIVAL.tmdbId } });
    });

    it("during \"Next episode in 10s\", the card goes for the Viewer left alone, who stays on the episode", async () => {
      const { h, giorgi, mariam } = watchingTogether(SEVERANCE, S1E1);
      await playToTheEnd(h, giorgi, () => !!mariam.partySync?.view.nextEpisode);

      giorgi.watchParty.leave();
      await h.advanceAsync(200);
      expect(mariam.watchParty.left).toMatchObject({ by: "giorgi", title: SEVERANCE, episode: S1E1 });
      expect(mariam.partySync?.view.nextEpisode).toBeNull();

      await h.advanceAsync(20 * SECOND);
      expect(mariam.player).toMatchObject({ playable: S1E1, paused: true });
    });

    it("\"Stop\" closes the player", () => {
      const { h, mariam } = giorgiLeaves();

      mariam.watchParty.stop();
      h.advance(SECOND);
      expect(mariam.player).toBeNull();
      expect(mariam.watchParty.left).toBeNull();
    });

    it("while the Watch Party still waits for the other Viewer, cancels it", () => {
      const h = createHarness({ syncableSource: source });
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam");
      h.advance(SECOND);
      giorgi.watchParty.start(DUNE, null);
      h.advance(5 * SECOND);

      giorgi.watchParty.leave();
      h.advance(SECOND);
      expect(giorgi.player).toBeNull();
      expect(mariam.watchParty.invite).toBeNull();
      expect(mariam.watchParty.left).toBeNull();
      expect(mariam.watchParty.ended).toMatchObject({ title: DUNE, reason: "cancelled", by: "giorgi" });
    });
  });
});
