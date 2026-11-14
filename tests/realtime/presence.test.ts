import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import { createHarness, SECOND } from "./harness";

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };
const SEVERANCE = { contentType: WatchPlaylistItemType.TV_SHOW, tmdbId: 95396, name: "Severance" };

describe("presence", () => {
  it("shows a Viewer as online once one of their devices connects", () => {
    const h = createHarness();
    const mariam = h.device("mariam");
    h.advance(SECOND);
    expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: false, watching: null });

    h.device("giorgi");
    h.advance(SECOND);
    expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: true, watching: null });
  });

  it("shows a Viewer as offline within a couple of seconds after they close the site", () => {
    const h = createHarness();
    const mariam = h.device("mariam");
    const giorgi = h.device("giorgi");
    h.advance(SECOND);

    giorgi.closeSite();
    h.advance(3 * SECOND);
    expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: false, watching: null });
  });

  it("never shows a Viewer offline while they reload the page", () => {
    const h = createHarness();
    const giorgi = h.device("giorgi");
    const mariam = h.device("mariam");
    h.advance(SECOND);

    giorgi.closeSite();
    h.advance(SECOND);
    h.device("giorgi"); // The reloaded page connects again.
    h.advance(10 * SECOND);

    const giorgiAsMariamHeard = mariam.received.flatMap((message) =>
      message.type === "presence" ? [message.viewers.giorgi.online] : [],
    );
    expect(giorgiAsMariamHeard).toEqual([true]);
  });

  it("keeps a Viewer with several devices online until their last device disconnects", () => {
    const h = createHarness();
    const mariam = h.device("mariam");
    const laptop = h.device("giorgi");
    const phone = h.device("giorgi");
    h.advance(SECOND);

    laptop.closeSite();
    h.advance(10 * SECOND);
    expect(mariam.presence.other?.online).toBe(true);

    phone.closeSite();
    h.advance(3 * SECOND);
    expect(mariam.presence.other?.online).toBe(false);
  });

  describe("watching", () => {
    it("shows the Title a Viewer is watching while their player is open", () => {
      const h = createHarness();
      const mariam = h.device("mariam");
      const giorgi = h.device("giorgi");
      h.advance(SECOND);

      giorgi.presence.setWatching(DUNE);
      h.advance(SECOND);
      expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: true, watching: DUNE });

      giorgi.presence.setWatching(null);
      h.advance(SECOND);
      expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: true, watching: null });
    });

    it("stops showing a Title when the device playing it disconnects", () => {
      const h = createHarness();
      const mariam = h.device("mariam");
      const laptop = h.device("giorgi");
      h.device("giorgi");
      h.advance(SECOND);
      laptop.presence.setWatching(DUNE);
      h.advance(SECOND);

      laptop.closeSite();
      h.advance(3 * SECOND);
      expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: true, watching: null });
    });

    it("shows the Title opened most recently when a Viewer plays on two devices", () => {
      const h = createHarness();
      const mariam = h.device("mariam");
      const laptop = h.device("giorgi");
      const phone = h.device("giorgi");
      h.advance(SECOND);

      laptop.presence.setWatching(DUNE);
      h.advance(SECOND);
      phone.presence.setWatching(SEVERANCE);
      h.advance(SECOND);
      expect(mariam.presence.other?.watching).toEqual(SEVERANCE);

      phone.presence.setWatching(null);
      h.advance(SECOND);
      expect(mariam.presence.other?.watching).toEqual(DUNE);
    });

    it("still shows the Title after the server restarts", () => {
      const h = createHarness();
      const mariam = h.device("mariam");
      const giorgi = h.device("giorgi");
      h.advance(SECOND);
      giorgi.presence.setWatching(DUNE);
      h.advance(SECOND);

      h.server.stop();
      h.advance(2 * SECOND);
      h.server.start();
      h.advance(10 * SECOND);
      expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: true, watching: DUNE });
    });

    it("shows a Title opened while the connection was down once it is back", () => {
      const h = createHarness();
      const mariam = h.device("mariam");
      const giorgi = h.device("giorgi");
      h.advance(SECOND);

      h.server.stop();
      h.advance(2 * SECOND);
      giorgi.presence.setWatching(DUNE);
      h.server.start();
      h.advance(10 * SECOND);
      expect(mariam.presence.other?.watching).toEqual(DUNE);
    });
  });

  it("ignores a Title it cannot make sense of", () => {
    const h = createHarness();
    const mariam = h.device("mariam");
    const giorgi = h.device("giorgi");
    h.advance(SECOND);
    giorgi.presence.setWatching(DUNE);
    h.advance(SECOND);

    giorgi.presence.setWatching({ contentType: "BOOK", tmdbId: -1 } as never);
    giorgi.client.send({ type: "presence:nonsense" } as never);
    h.advance(SECOND);
    expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: true, watching: DUNE });
  });

  it("tells each of a Viewer's devices about the other Viewer", () => {
    const h = createHarness();
    const laptop = h.device("giorgi");
    const phone = h.device("giorgi");
    h.device("mariam");
    h.advance(SECOND);

    expect(laptop.presence.other).toEqual({ viewer: "mariam", online: true, watching: null });
    expect(phone.presence.other).toEqual({ viewer: "mariam", online: true, watching: null });
  });
});
