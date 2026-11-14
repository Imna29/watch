import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import type { MediaTrack } from "../../realtime/call/platform";
import { describeChange } from "../../realtime/watchParty/changeMessage";
import type { Playable, SourceId } from "../../utils/sources";
import { createHarness, SECOND, syncableSourcesUnderTest, type TestDevice } from "./harness";
import type { FakeRemoteTrack } from "./harness/fakeMedia";

const MINUTE = 60 * SECOND;

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };
const SEVERANCE = { contentType: WatchPlaylistItemType.TV_SHOW, tmdbId: 95396, name: "Severance" };
const S1E1 = { season: 1, episode: 1 };
const S1E2 = { season: 1, episode: 2 };

/** What reaches this track over the Call right now, e.g. "giorgi1 tab"; null when nothing does. */
function sourceOf(track: MediaTrack | null) {
  return (track as FakeRemoteTrack | null)?.source()?.label ?? null;
}

/** The shared tab's picture this device gets over the Call right now, e.g. "giorgi1 tab". */
function seesTab(device: TestDevice) {
  return sourceOf(device.call.state.remote.tabVideo);
}

/** The change message `device` shows over the player ("Mariam stopped the Tab Share"); null when none. */
function message(device: TestDevice) {
  const change = device.partySync?.view.lastChange;
  return change ? describeChange(change) : null;
}

/** The microphone this device hears over the Call right now, e.g. "giorgi1 microphone". */
function hears(device: TestDevice) {
  return sourceOf(device.call.state.remote.mic);
}

/** The shared tab's sound this device gets over the Call right now, e.g. "giorgi1 tab sound". */
function hearsTab(device: TestDevice) {
  return sourceOf(device.call.state.remote.tabAudio);
}

describe.each(syncableSourcesUnderTest())("Tab Share in a Watch Party on %s", (source) => {
  /** The Syncable Source the Watch Party goes on to after `source`. */
  const next = syncableSourcesUnderTest().find((other) => other !== source)!;

  /**
   * Giorgi starts Dune and Mariam joins, but no Syncable Source has it: both
   * are offered Tab Share. Neither is in the Call.
   */
  async function noSyncableSourceLeft() {
    const h = createHarness({ syncableSource: source, fallbackSources: [next] });
    const unavailable = { unavailable: true };
    const giorgi = h.device("giorgi", { player: unavailable });
    const mariam = h.device("mariam", { player: unavailable });
    await h.advanceAsync(SECOND);
    giorgi.watchParty.start(DUNE, null);
    await h.advanceAsync(SECOND);
    mariam.watchParty.join();
    await h.advanceAsync(25 * SECOND);
    giorgi.watchParty.switchSource(next);
    await h.advanceAsync(25 * SECOND);
    expect(mariam.watchParty.party?.fallback).toEqual({ kind: "tab-share" });
    return { h, giorgi, mariam };
  }

  it("lets a Viewer share their tab, playing any Source, which the other Viewer sees and hears over the Call", async () => {
    const { h, giorgi, mariam } = await noSyncableSourceLeft();

    giorgi.tabShare.start("vidlink");
    await h.advanceAsync(SECOND);
    // Starting Tab Share joined the Call on Giorgi's device.
    expect(giorgi.call.state.status).toBe("in");
    for (const device of [giorgi, mariam]) {
      expect(device.watchParty.party).toMatchObject({
        mode: "tab-share",
        tabShare: { sharer: "giorgi", source: "vidlink", sound: true },
      });
    }

    mariam.call.join();
    await h.advanceAsync(SECOND);
    expect(seesTab(mariam)).toBe("giorgi1 tab");
    expect(hearsTab(mariam)).toBe("giorgi1 tab sound");
    expect(seesTab(giorgi)).toBeNull();
  });

  it("tells both Viewers when the browser shares the tab without its sound", async () => {
    const { h, giorgi, mariam } = await noSyncableSourceLeft();
    giorgi.media.tabSound = false; // Firefox or Safari, or "Also share tab audio" unticked.

    giorgi.tabShare.start("vidlink");
    mariam.call.join();
    await h.advanceAsync(SECOND);

    expect(giorgi.call.state.tab).toEqual({ sharing: true, sound: false, problem: null });
    for (const device of [giorgi, mariam]) {
      expect(device.watchParty.party?.tabShare).toEqual({ sharer: "giorgi", source: "vidlink", sound: false });
    }
    expect(seesTab(mariam)).toBe("giorgi1 tab");
    expect(hearsTab(mariam)).toBeNull();
  });

  it.each([
    ["the browser cannot share a tab", "NotSupportedError", "unsupported"],
    ["the Viewer cancels the browser's picker", "NotAllowedError", "blocked"],
  ] as const)("says why nothing is shared when %s, and leaves the Watch Party and the Call as they were", async (_, error, problem) => {
    const { h, giorgi, mariam } = await noSyncableSourceLeft();
    giorgi.media.tabCapture = error;

    giorgi.tabShare.start("vidlink");
    await h.advanceAsync(SECOND);

    expect(giorgi.tabShare.state).toEqual({ starting: false, sharingHere: false, problem });
    expect(giorgi.call.state.status).toBe("out");
    for (const device of [giorgi, mariam]) {
      expect(device.watchParty.party).toMatchObject({ mode: "syncable-source", fallback: { kind: "tab-share" } });
    }

    // Another try that works clears it.
    giorgi.media.tabCapture = "allow";
    giorgi.tabShare.start("vidlink");
    await h.advanceAsync(SECOND);
    expect(giorgi.tabShare.state).toEqual({ starting: false, sharingHere: true, problem: null });
  });

  it("lets the sharer play another Source in the shared tab", async () => {
    const { h, giorgi, mariam } = await noSyncableSourceLeft();
    giorgi.tabShare.start("vidlink");
    mariam.call.join();
    await h.advanceAsync(SECOND);

    giorgi.tabShare.changeSource("2embed");
    await h.advanceAsync(SECOND);

    expect(mariam.watchParty.party).toMatchObject({ mode: "tab-share", tabShare: { sharer: "giorgi", source: "2embed" } });
    expect(seesTab(mariam)).toBe("giorgi1 tab");
  });

  /** Giorgi and Mariam watch Dune together on `source`, a minute in, both in the Call. */
  async function watchingTogether() {
    const h = createHarness({ syncableSource: source, fallbackSources: [next] });
    const giorgi = h.device("giorgi");
    const mariam = h.device("mariam");
    await h.advanceAsync(SECOND);
    giorgi.watchParty.start(DUNE, null);
    await h.advanceAsync(SECOND);
    mariam.watchParty.join();
    giorgi.call.join();
    mariam.call.join();
    await h.advanceAsync(MINUTE);
    expect(mariam.player?.paused).toBe(false);
    return { h, giorgi, mariam };
  }

  it("can start while a Syncable Source plays: the Watch Party stands still, and no Syncable Source player runs meanwhile", async () => {
    const { h, giorgi, mariam } = await watchingTogether();
    const position = mariam.player!.position;

    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);
    expect(seesTab(giorgi)).toBe("mariam1 tab");
    for (const device of [giorgi, mariam]) {
      expect(device.player).toBeNull();
      expect(device.watchParty.party).toMatchObject({ mode: "tab-share", phase: { name: "paused" } });
      expect(device.watchParty.party!.anchor).toMatchObject({ playing: false });
      expect(device.watchParty.party!.anchor.position).toBeCloseTo(position, 0);
    }

    await h.advanceAsync(MINUTE);
    expect(giorgi.watchParty.party?.anchor.position).toBeCloseTo(position, 0);
    expect(seesTab(giorgi)).toBe("mariam1 tab");
  });

  it.each(["mariam", "giorgi"] as const)(
    "stops when %s stops it: both go back to the Syncable Source, paused where they were, and the tab is released",
    async (stopper) => {
      const { h, giorgi, mariam } = await watchingTogether();
      mariam.tabShare.start("vidsrc-cc");
      await h.advanceAsync(SECOND);
      const position = giorgi.watchParty.party!.anchor.position;
      await h.advanceAsync(MINUTE);

      (stopper === "mariam" ? mariam : giorgi).tabShare.stop();
      await h.advanceAsync(30 * SECOND);

      for (const device of [giorgi, mariam]) {
        expect(device.watchParty.party).toMatchObject({ mode: "syncable-source", tabShare: null });
        expect(device.player).toMatchObject({ sourceId: source, ready: true, paused: true });
        expect(device.player!.position).toBeCloseTo(position, 0);
      }
      expect(seesTab(giorgi)).toBeNull();
      expect(hearsTab(giorgi)).toBeNull();
      expect(mariam.call.state.tab.sharing).toBe(false);
      expect(mariam.media.tracks.filter((track) => track.label.startsWith("mariam1 tab")).every((track) => track.stopped)).toBe(true);
      // The Call goes on.
      expect(mariam.call.state.status).toBe("in");
      expect(hears(giorgi)).toBe("mariam1 microphone");

      // Then they watch on together as before.
      giorgi.player!.controls.play();
      await h.advanceAsync(10 * SECOND);
      expect(mariam.player?.paused).toBe(false);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 0);
    },
  );

  /** Both see the Watch Party back on its Syncable Source, and the shared tab is gone. */
  function expectBackOnTheSyncableSource(giorgi: TestDevice, mariam: TestDevice) {
    for (const device of [giorgi, mariam]) {
      expect(device.watchParty.party).toMatchObject({ mode: "syncable-source", tabShare: null, phase: { name: "paused" } });
      expect(device.player).toMatchObject({ sourceId: source, ready: true, paused: true });
    }
    expect(seesTab(giorgi)).toBeNull();
    expect(mariam.call.state.tab.sharing).toBe(false);
  }

  it("tells the other Viewer who stopped it", async () => {
    const { h, giorgi, mariam } = await watchingTogether();
    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);

    giorgi.tabShare.stop();
    await h.advanceAsync(SECOND);
    expect(message(mariam)).toBe("Giorgi stopped the Tab Share");
    expect(message(giorgi)).toBeNull();

    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);
    mariam.media.stopSharingFromBrowser();
    await h.advanceAsync(SECOND);
    expect(message(giorgi)).toBe("Mariam stopped the Tab Share");
  });

  it("stops when the sharer stops sharing from the browser", async () => {
    const { h, giorgi, mariam } = await watchingTogether();
    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);

    mariam.media.stopSharingFromBrowser();
    await h.advanceAsync(30 * SECOND);

    expectBackOnTheSyncableSource(giorgi, mariam);
    expect(hears(giorgi)).toBe("mariam1 microphone");
  });

  it("stops when the sharer leaves the Call, and the Watch Party goes on", async () => {
    const { h, giorgi, mariam } = await watchingTogether();
    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);

    mariam.call.leave();
    await h.advanceAsync(30 * SECOND);

    expectBackOnTheSyncableSource(giorgi, mariam);
    expect(mariam.media.tracks.filter((track) => track.label === "mariam1 tab")[0]?.stopped).toBe(true);
  });

  it("goes on while the other Viewer leaves the Call, and they see it again once they join it again", async () => {
    const { h, giorgi, mariam } = await watchingTogether();
    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);

    giorgi.call.leave();
    await h.advanceAsync(30 * SECOND);
    expect(giorgi.watchParty.party).toMatchObject({ mode: "tab-share", tabShare: { sharer: "mariam" } });
    expect(mariam.call.state.tab.sharing).toBe(true);

    giorgi.call.join();
    await h.advanceAsync(SECOND);
    expect(seesTab(giorgi)).toBe("mariam1 tab");
    expect(hearsTab(giorgi)).toBe("mariam1 tab sound");
  });

  it.each(["mariam", "giorgi"] as const)("stops when %s leaves the Watch Party, and the Call goes on", async (leaver) => {
    const { h, giorgi, mariam } = await watchingTogether();
    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);

    (leaver === "mariam" ? mariam : giorgi).watchParty.leave();
    await h.advanceAsync(5 * SECOND);

    const stayer = leaver === "mariam" ? giorgi : mariam;
    expect(stayer.watchParty.left?.by).toBe(leaver);
    expect(mariam.call.state.tab.sharing).toBe(false);
    expect(seesTab(giorgi)).toBeNull();
    expect(hears(giorgi)).toBe("mariam1 microphone");
  });

  it.each([
    ["the Watch Party", (phone: TestDevice) => phone.watchParty.join()],
    ["the Call", (phone: TestDevice) => phone.call.join()],
  ] as const)("stops when the sharer moves %s to another device", async (_, moveTo) => {
    const { h, giorgi, mariam } = await watchingTogether();
    const phone = h.device("mariam");
    await h.advanceAsync(SECOND);
    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);
    expect(seesTab(giorgi)).toBe("mariam1 tab");

    moveTo(phone);
    await h.advanceAsync(30 * SECOND);

    for (const device of [giorgi, mariam, phone]) {
      expect(device.watchParty.party).toMatchObject({ mode: "syncable-source", tabShare: null });
    }
    expect(mariam.call.state.tab.sharing).toBe(false);
    expect(mariam.media.tracks.find((track) => track.label === "mariam1 tab")?.stopped).toBe(true);
    expect(seesTab(giorgi)).toBeNull();
  });

  it("stops for another episode, which both try on the Syncable Sources again", async () => {
    const h = createHarness({ syncableSource: source, fallbackSources: [next] });
    // No Syncable Source has the first episode.
    const lacks = (_: SourceId, playable: Playable) => playable.kind === "episode" && playable.episode === 1;
    const giorgi = h.device("giorgi", { player: { unavailable: lacks } });
    const mariam = h.device("mariam", { player: { unavailable: lacks } });
    await h.advanceAsync(SECOND);
    giorgi.watchParty.start(SEVERANCE, S1E1);
    await h.advanceAsync(SECOND);
    mariam.watchParty.join();
    await h.advanceAsync(25 * SECOND);
    giorgi.watchParty.switchSource(next);
    await h.advanceAsync(25 * SECOND);
    giorgi.tabShare.start("vidlink");
    mariam.call.join();
    await h.advanceAsync(SECOND);
    expect(seesTab(mariam)).toBe("giorgi1 tab");

    mariam.watchParty.changeEpisode(S1E2);
    await h.advanceAsync(15 * SECOND);

    for (const device of [giorgi, mariam]) {
      expect(device.watchParty.party).toMatchObject({ episode: S1E2, mode: "syncable-source", tabShare: null });
      expect(device.player).toMatchObject({ playable: { episode: 2 }, paused: false });
    }
    expect(giorgi.call.state.tab.sharing).toBe(false);
    expect(seesTab(mariam)).toBeNull();
  });

  describe("when a Viewer's connection drops", () => {
    it("goes on while the watching Viewer is away, and they see the tab again once back", async () => {
      const { h, giorgi, mariam } = await watchingTogether();
      mariam.tabShare.start("vidsrc-cc");
      await h.advanceAsync(SECOND);
      expect(seesTab(giorgi)).toBe("mariam1 tab");

      giorgi.drop();
      await h.advanceAsync(20 * SECOND);
      // A Tab Share stands still anyway: nobody is waited for.
      expect(mariam.watchParty.party).toMatchObject({ mode: "tab-share", phase: { name: "paused" } });
      expect(mariam.call.state.tab.sharing).toBe(true);

      giorgi.restore();
      await h.advanceAsync(30 * SECOND);
      expect(giorgi.watchParty.party).toMatchObject({ mode: "tab-share", phase: { name: "paused" } });
      expect(seesTab(giorgi)).toBe("mariam1 tab");
    });

    it("goes on while the sharer is away, and the other Viewer sees the tab again once she is back", async () => {
      const { h, giorgi, mariam } = await watchingTogether();
      mariam.tabShare.start("vidsrc-cc");
      await h.advanceAsync(SECOND);

      mariam.drop();
      await h.advanceAsync(20 * SECOND);
      expect(giorgi.watchParty.party).toMatchObject({ mode: "tab-share", phase: { name: "paused" } });

      mariam.restore();
      await h.advanceAsync(30 * SECOND);
      expect(mariam.tabShare.state.sharingHere).toBe(true);
      expect(giorgi.watchParty.party).toMatchObject({ mode: "tab-share", phase: { name: "paused" } });
      expect(seesTab(giorgi)).toBe("mariam1 tab");
    });

    it("stops once the sharer has been gone a while: the other Viewer is told, and waits for her on the Syncable Source", async () => {
      const { h, giorgi, mariam } = await watchingTogether();
      mariam.tabShare.start("vidsrc-cc");
      await h.advanceAsync(SECOND);
      const position = giorgi.watchParty.party!.anchor.position;

      mariam.closeSite(); // Her laptop's battery dies.
      await h.advanceAsync(20 * SECOND);
      expect(giorgi.watchParty.party).toMatchObject({ mode: "tab-share" });

      let told: string | null = null;
      for (let waited = 0; waited < 20 * SECOND && !told; waited += 100) {
        await h.advanceAsync(100);
        told = message(giorgi);
      }
      expect(told).toBe("Mariam went offline, so the Tab Share stopped");
      await h.advanceAsync(10 * SECOND);
      expect(giorgi.watchParty.party).toMatchObject({
        mode: "syncable-source",
        tabShare: null,
        phase: { name: "waiting", viewer: "mariam", reason: "disconnected" },
      });
      expect(giorgi.partySync?.view.waitingFor).toBe("mariam");
      expect(giorgi.player).toMatchObject({ sourceId: source, ready: true, paused: true });
      expect(giorgi.player!.position).toBeCloseTo(position, 0);
      expect(seesTab(giorgi)).toBeNull();

      // She comes back on her phone, and they watch on together from there.
      const phone = h.device("mariam");
      await h.advanceAsync(15 * SECOND);
      expect(phone.watchParty.activeHere).toBe(true);
      giorgi.player!.controls.play();
      await h.advanceAsync(10 * SECOND);
      expect(phone.player?.paused).toBe(false);
      expect(phone.player!.position).toBeCloseTo(giorgi.player!.position, 0);
    });
  });

  it("stops when the sharer reloads the page, which ends the tab's sharing: both go back to the Syncable Source", async () => {
    const { h, giorgi, mariam } = await watchingTogether();
    mariam.tabShare.start("vidsrc-cc");
    await h.advanceAsync(SECOND);
    const position = giorgi.watchParty.party!.anchor.position;

    const reloaded = mariam.reload();
    await h.advanceAsync(30 * SECOND);

    for (const device of [giorgi, reloaded]) {
      expect(device.watchParty.party).toMatchObject({ mode: "syncable-source", tabShare: null, phase: { name: "paused" } });
      expect(device.player).toMatchObject({ sourceId: source, ready: true, paused: true });
      expect(device.player!.position).toBeCloseTo(position, 0);
    }
    expect(reloaded.watchParty.activeHere).toBe(true);
    expect(seesTab(giorgi)).toBeNull();
  });
});
