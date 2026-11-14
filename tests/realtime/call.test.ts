import { describe, expect, it } from "vitest";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import type { MediaTrack } from "../../realtime/call/platform";
import type { AdaptedSourceId } from "../../realtime/watchParty/sources";
import { createHarness, SECOND, syncableSourcesUnderTest, type TestDevice } from "./harness";
import type { FakeRemoteTrack, FakeTrack } from "./harness/fakeMedia";

/** The microphone this device hears over the Call right now, e.g. "giorgi1 microphone". */
function hears(device: TestDevice) {
  return sourceOf(device.call.state.remote.mic);
}

/** The camera this device sees over the Call right now, e.g. "giorgi1 camera". */
function sees(device: TestDevice) {
  return sourceOf(device.call.state.remote.camera);
}

function sourceOf(track: MediaTrack | null) {
  return (track as FakeRemoteTrack | null)?.source()?.label ?? null;
}

const DUNE = { contentType: WatchPlaylistItemType.MOVIE, tmdbId: 438631, name: "Dune" };

/** Giorgi and Mariam, one device each, both online. */
async function bothOnline(syncableSource?: AdaptedSourceId) {
  const h = createHarness({ syncableSource });
  const giorgi = h.device("giorgi");
  const mariam = h.device("mariam");
  await h.advanceAsync(SECOND);
  return { h, giorgi, mariam };
}

describe("the Call", () => {
  it("lets both Viewers hear each other once both join, with microphones on and cameras off", async () => {
    const { h, giorgi, mariam } = await bothOnline();

    giorgi.call.join();
    mariam.call.join();
    await h.advanceAsync(SECOND);

    expect(hears(mariam)).toBe("giorgi1 microphone");
    expect(hears(giorgi)).toBe("mariam1 microphone");
    expect(sees(mariam)).toBeNull();
    expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
    expect(giorgi.call.state.other).toEqual({ mic: true, camera: false });
  });

  it("shows a Viewer waiting in the Call to the other, until they join too", async () => {
    const { h, giorgi, mariam } = await bothOnline();

    giorgi.call.join();
    await h.advanceAsync(SECOND);

    expect(giorgi.call.state).toMatchObject({ status: "in", other: null, connection: "waiting" });
    expect(mariam.call.state).toMatchObject({ status: "out", other: { mic: true, camera: false } });
    expect(giorgi.media.peerConnections).toEqual([]);
  });

  it("shows a Viewer's other devices that they are in the Call on another device", async () => {
    const h = createHarness();
    const laptop = h.device("giorgi");
    const phone = h.device("giorgi");
    h.device("mariam");
    await h.advanceAsync(SECOND);
    expect(phone.call.state.inCallElsewhere).toBe(false);

    laptop.call.join();
    await h.advanceAsync(SECOND);
    expect(phone.call.state).toMatchObject({ status: "out", inCallElsewhere: true, continuedElsewhere: false });
    expect(laptop.call.state.inCallElsewhere).toBe(false);

    laptop.call.leave();
    await h.advanceAsync(SECOND);
    expect(phone.call.state.inCallElsewhere).toBe(false);
  });

  it("shows the other Viewer muting and unmuting, and goes silent while muted", async () => {
    const { h, giorgi, mariam } = await bothOnline();
    giorgi.call.join();
    mariam.call.join();
    await h.advanceAsync(SECOND);

    giorgi.call.setMic(false);
    await h.advanceAsync(SECOND);
    expect(giorgi.call.state.mic).toEqual({ on: false, problem: null });
    expect(mariam.call.state.other).toEqual({ mic: false, camera: false });
    expect(hears(mariam)).toBeNull();

    giorgi.call.setMic(true);
    await h.advanceAsync(SECOND);
    expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
    expect(hears(mariam)).toBe("giorgi1 microphone");
  });

  it("joins with the microphone on, even when the Viewer had muted it before leaving", async () => {
    const { h, giorgi, mariam } = await bothOnline();
    giorgi.call.join();
    mariam.call.join();
    await h.advanceAsync(SECOND);
    giorgi.call.setMic(false);
    await h.advanceAsync(SECOND);

    giorgi.call.leave();
    await h.advanceAsync(SECOND);
    giorgi.call.join();
    await h.advanceAsync(SECOND);

    expect(giorgi.call.state.mic).toEqual({ on: true, problem: null });
    expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
    expect(hears(mariam)).toBe("giorgi1 microphone");
  });

  it("shows the other Viewer's camera while it is on, and releases the camera when turned off", async () => {
    const { h, giorgi, mariam } = await bothOnline();
    giorgi.call.join();
    mariam.call.join();
    await h.advanceAsync(SECOND);

    mariam.call.setCamera(true);
    await h.advanceAsync(SECOND);
    expect(giorgi.call.state.other).toEqual({ mic: true, camera: true });
    expect(sees(giorgi)).toBe("mariam1 camera");
    expect((mariam.call.state.local.camera as FakeTrack | null)?.label).toBe("mariam1 camera"); // Her self view.

    mariam.call.setCamera(false);
    await h.advanceAsync(SECOND);
    expect(giorgi.call.state.other).toEqual({ mic: true, camera: false });
    expect(sees(giorgi)).toBeNull();
    expect(mariam.media.tracks.find((track) => track.kind === "video")?.stopped).toBe(true);
    expect(hears(giorgi)).toBe("mariam1 microphone");
  });

  it("lets a Viewer leave: the other sees them gone, and their microphone and camera are released", async () => {
    const { h, giorgi, mariam } = await bothOnline();
    giorgi.call.join();
    mariam.call.join();
    await h.advanceAsync(SECOND);
    giorgi.call.setCamera(true);
    await h.advanceAsync(SECOND);

    giorgi.call.leave();
    await h.advanceAsync(SECOND);

    expect(giorgi.call.state).toMatchObject({ status: "out", connection: "waiting" });
    expect(giorgi.media.tracks.every((track) => track.stopped)).toBe(true);
    expect(mariam.call.state).toMatchObject({ status: "in", other: null, connection: "waiting" });
    expect(hears(mariam)).toBeNull();
    expect(giorgi.media.peerConnections.at(-1)?.connectionState).toBe("closed");
  });

  describe("in push-to-talk", () => {
    /** Giorgi and Mariam in the Call, microphones on. */
    async function inTheCall() {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);
      return { h, giorgi, mariam };
    }

    it("lets the other Viewer hear the microphone only while the Viewer holds the talk button", async () => {
      const { h, giorgi, mariam } = await inTheCall();

      giorgi.call.setPushToTalk(true);
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state).toMatchObject({ mic: { on: false }, pushToTalk: { on: true, holding: false } });
      expect(mariam.call.state.other).toEqual({ mic: false, camera: false });
      expect(hears(mariam)).toBeNull();

      giorgi.call.holdToTalk(true);
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state).toMatchObject({ mic: { on: true }, pushToTalk: { on: true, holding: true } });
      expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
      expect(hears(mariam)).toBe("giorgi1 microphone");

      giorgi.call.holdToTalk(false); // Released, the pointer left the button, or the touch was cancelled.
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state).toMatchObject({ mic: { on: false }, pushToTalk: { on: true, holding: false } });
      expect(mariam.call.state.other).toEqual({ mic: false, camera: false });
      expect(hears(mariam)).toBeNull();
    });

    it("leaves the microphone as the mute button left it when push-to-talk is turned off", async () => {
      const { h, giorgi, mariam } = await inTheCall();
      giorgi.call.setPushToTalk(true);
      giorgi.call.holdToTalk(true);
      await h.advanceAsync(SECOND);

      giorgi.call.setPushToTalk(false); // While still holding the button.
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state).toMatchObject({ mic: { on: true }, pushToTalk: { on: false, holding: false } });
      expect(hears(mariam)).toBe("giorgi1 microphone");

      giorgi.call.setMic(false);
      giorgi.call.setPushToTalk(true);
      await h.advanceAsync(SECOND);
      giorgi.call.setPushToTalk(false);
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state.mic.on).toBe(false);
      expect(mariam.call.state.other).toEqual({ mic: false, camera: false });
      expect(hears(mariam)).toBeNull();
    });

    it("stays on when the Viewer leaves and joins again, and joins with the microphone quiet", async () => {
      const { h, giorgi, mariam } = await inTheCall();
      giorgi.call.setPushToTalk(true);
      giorgi.call.holdToTalk(true);
      await h.advanceAsync(SECOND);

      giorgi.call.leave(); // While holding the button.
      await h.advanceAsync(SECOND);
      giorgi.call.join();
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state).toMatchObject({
        status: "in",
        mic: { on: false },
        pushToTalk: { on: true, holding: false },
      });
      expect(mariam.call.state.other).toEqual({ mic: false, camera: false });
      expect(hears(mariam)).toBeNull();

      giorgi.call.holdToTalk(true);
      await h.advanceAsync(SECOND);
      expect(hears(mariam)).toBe("giorgi1 microphone");
    });

    it("asks for a microphone that could not start when the button is held, and keeps it quiet once let go", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.media.microphone = "NotAllowedError";
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);
      giorgi.call.setPushToTalk(true);
      await h.advanceAsync(SECOND);

      giorgi.media.microphone = "allow";
      giorgi.media.promptMs = 3 * SECOND; // The browser asks again.
      giorgi.call.holdToTalk(true);
      await h.advanceAsync(SECOND);
      giorgi.call.holdToTalk(false); // To answer the browser.
      await h.advanceAsync(5 * SECOND);
      expect(giorgi.call.state).toMatchObject({
        mic: { on: false, problem: null },
        pushToTalk: { on: true, holding: false },
      });
      expect(mariam.call.state.other).toEqual({ mic: false, camera: false });
      expect(hears(mariam)).toBeNull();

      giorgi.call.holdToTalk(true);
      await h.advanceAsync(SECOND);
      expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
      expect(hears(mariam)).toBe("giorgi1 microphone");
    });
  });

  describe("without a Watch Party", () => {
    // Only "with a Watch Party" below starts one: the Call never needs one.
    it("stays connected while the Viewers browse and open their own players", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.presence.setWatching(DUNE);
      mariam.presence.setWatching({ contentType: WatchPlaylistItemType.TV_SHOW, tmdbId: 95396, name: "Severance" });
      await h.advanceAsync(10 * SECOND);
      giorgi.presence.setWatching(null);
      await h.advanceAsync(10 * SECOND);

      expect(giorgi.media.peerConnections).toHaveLength(1);
      expect(hears(mariam)).toBe("giorgi1 microphone");
      expect(hears(giorgi)).toBe("mariam1 microphone");
    });
  });

  describe.each(syncableSourcesUnderTest())("with a Watch Party on %s", (source) => {
    /** Giorgi and Mariam, one device each, watching Dune together. */
    async function watchingTogether() {
      const h = createHarness({ syncableSource: source });
      const giorgi = h.device("giorgi");
      const mariam = h.device("mariam");
      await h.advanceAsync(SECOND);
      giorgi.watchParty.start(DUNE, null);
      await h.advanceAsync(SECOND);
      mariam.watchParty.join();
      await h.advanceAsync(15 * SECOND);
      return { h, giorgi, mariam };
    }

    function expectWatchingInStep(giorgi: TestDevice, mariam: TestDevice) {
      expect(giorgi.watchParty.activeHere && mariam.watchParty.activeHere).toBe(true);
      expect(giorgi.player?.paused).toBe(false);
      expect(mariam.player?.paused).toBe(false);
      expect(mariam.player!.position).toBeCloseTo(giorgi.player!.position, 1);
    }

    it("joins during the Watch Party, and leaving the Call leaves the Watch Party playing", async () => {
      const { h, giorgi, mariam } = await watchingTogether();

      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);
      expect(hears(mariam)).toBe("giorgi1 microphone");
      expect(hears(giorgi)).toBe("mariam1 microphone");
      expectWatchingInStep(giorgi, mariam);

      giorgi.call.leave();
      await h.advanceAsync(10 * SECOND);
      expect(mariam.call.state.other).toBeNull();
      expectWatchingInStep(giorgi, mariam);
    });

    it("stays connected while a Watch Party starts and ends", async () => {
      const { h, giorgi, mariam } = await bothOnline(source);
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.watchParty.start(DUNE, null);
      await h.advanceAsync(SECOND);
      mariam.watchParty.join();
      await h.advanceAsync(15 * SECOND);
      expectWatchingInStep(giorgi, mariam);
      giorgi.watchParty.cancel();
      await h.advanceAsync(5 * SECOND);

      expect(giorgi.watchParty.activeHere || mariam.watchParty.activeHere).toBe(false);
      expect(giorgi.player).toBeNull();
      expect(giorgi.media.peerConnections).toHaveLength(1);
      expect(hears(mariam)).toBe("giorgi1 microphone");
      expect(hears(giorgi)).toBe("mariam1 microphone");
    });

    it("carries on the Watch Party when the microphone is blocked", async () => {
      const { h, giorgi, mariam } = await watchingTogether();

      giorgi.media.microphone = "NotAllowedError";
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(5 * SECOND);

      expect(giorgi.call.state.mic.problem).toBe("blocked");
      expect(hears(giorgi)).toBe("mariam1 microphone");
      expectWatchingInStep(giorgi, mariam);
    });
  });

  describe("when the microphone or camera is blocked", () => {
    it("still joins to listen, says why the microphone is off, and asks again when it is turned on", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.media.microphone = "NotAllowedError";
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      expect(giorgi.call.state).toMatchObject({ status: "in", mic: { on: false, problem: "blocked" } });
      expect(mariam.call.state.other).toEqual({ mic: false, camera: false });
      expect(hears(giorgi)).toBe("mariam1 microphone");
      expect(hears(mariam)).toBeNull();

      giorgi.media.microphone = "allow"; // Allowed in the browser's site settings.
      giorgi.call.setMic(true);
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state.mic).toEqual({ on: true, problem: null });
      expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
      expect(hears(mariam)).toBe("giorgi1 microphone");
    });

    it("leaves the camera off when it is turned off while the browser still asks for it", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.media.promptMs = 3 * SECOND;
      giorgi.call.setCamera(true);
      await h.advanceAsync(SECOND);
      giorgi.call.setCamera(false);
      await h.advanceAsync(5 * SECOND); // Then the Viewer allows the camera.

      expect(giorgi.call.state.camera).toEqual({ on: false, problem: null });
      expect(giorgi.media.tracks.filter((track) => track.kind === "video").every((track) => track.stopped)).toBe(true);
      expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
    });

    it("never joins when the Viewer leaves while the browser still asks for the microphone", async () => {
      const { h, giorgi, mariam } = await bothOnline();

      giorgi.media.promptMs = 3 * SECOND;
      giorgi.call.join();
      await h.advanceAsync(SECOND);
      expect(giorgi.call.state.status).toBe("joining");
      giorgi.call.leave();
      await h.advanceAsync(5 * SECOND);

      expect(giorgi.call.state.status).toBe("out");
      expect(giorgi.media.tracks.every((track) => track.stopped)).toBe(true);
      expect(mariam.received.some((message) => message.type === "call" && message.viewers.giorgi)).toBe(false);
    });

    it("says why the camera did not start, and the microphone carries on", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.media.camera = "NotReadableError"; // Another app holds the camera.
      giorgi.call.setCamera(true);
      await h.advanceAsync(SECOND);

      expect(giorgi.call.state.camera).toEqual({ on: false, problem: "in-use" });
      expect(mariam.call.state.other).toEqual({ mic: true, camera: false });
      expect(hears(mariam)).toBe("giorgi1 microphone");
    });
  });

  describe("setup messages", () => {
    it("reach only the other Viewer's Call device, never the Viewers' other devices", async () => {
      const h = createHarness();
      const giorgiLaptop = h.device("giorgi");
      const giorgiPhone = h.device("giorgi");
      const mariamLaptop = h.device("mariam");
      const mariamPhone = h.device("mariam");
      await h.advanceAsync(SECOND);

      giorgiLaptop.call.join();
      mariamPhone.call.join();
      await h.advanceAsync(SECOND);

      expect(signalsReceivedBy(giorgiLaptop)).toEqual(["answer", "candidate"]);
      expect(signalsReceivedBy(mariamPhone)).toEqual(["offer", "candidate"]);
      expect(signalsReceivedBy(giorgiPhone)).toEqual([]);
      expect(signalsReceivedBy(mariamLaptop)).toEqual([]);
      expect(hears(mariamPhone)).toBe("giorgi1 microphone");
      expect(hears(giorgiLaptop)).toBe("mariam2 microphone");
    });

    it("are not relayed from a device that is not in the Call", async () => {
      const h = createHarness();
      const giorgiLaptop = h.device("giorgi");
      const giorgiPhone = h.device("giorgi");
      const mariam = h.device("mariam");
      await h.advanceAsync(SECOND);
      giorgiLaptop.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);
      const before = signalsReceivedBy(mariam);

      const link = lastCallState(giorgiLaptop)?.link?.id ?? "";
      giorgiPhone.client.send({
        type: "call:signal",
        link,
        signal: { kind: "description", description: { type: "offer", sdp: "v=0 from the phone" } },
      });
      await h.advanceAsync(SECOND);

      expect(signalsReceivedBy(mariam)).toEqual(before);
      expect(hears(mariam)).toBe("giorgi1 microphone");
    });
  });

  describe("on one device at a time", () => {
    it("moves a Viewer's Call to the device they join from, and the old device shows it continued elsewhere", async () => {
      const h = createHarness();
      const laptop = h.device("giorgi");
      const phone = h.device("giorgi");
      const mariam = h.device("mariam");
      await h.advanceAsync(SECOND);
      laptop.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      phone.call.join();
      await h.advanceAsync(SECOND);

      expect(laptop.call.state).toMatchObject({ status: "out", continuedElsewhere: true, connection: "waiting" });
      expect(laptop.media.tracks.every((track) => track.stopped)).toBe(true);
      expect(hears(laptop)).toBeNull();
      expect(hears(mariam)).toBe("giorgi2 microphone");
      expect(hears(phone)).toBe("mariam1 microphone");

      phone.call.leave();
      await h.advanceAsync(SECOND);
      expect(laptop.call.state).toMatchObject({ status: "out", continuedElsewhere: false, inCallElsewhere: false });
    });

    it("does not let a device that was offline take the Call back from the device the Viewer moved to", async () => {
      const h = createHarness();
      const laptop = h.device("giorgi");
      const phone = h.device("giorgi");
      const mariam = h.device("mariam");
      await h.advanceAsync(SECOND);
      laptop.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      laptop.drop(); // Long enough for its connection to die.
      await h.advanceAsync(SECOND);
      phone.call.join();
      await h.advanceAsync(9 * SECOND);
      laptop.restore();
      await h.advanceAsync(15 * SECOND);

      expect(laptop.call.state).toMatchObject({ status: "out", continuedElsewhere: true });
      expect(laptop.media.tracks.every((track) => track.stopped)).toBe(true);
      expect(hears(mariam)).toBe("giorgi2 microphone");
      expect(hears(phone)).toBe("mariam1 microphone");
    });
  });

  describe("reconnecting", () => {
    it("rejoins the Call by itself after its connection drops for a while", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.drop();
      await h.advanceAsync(10 * SECOND);
      giorgi.restore();
      await h.advanceAsync(15 * SECOND);

      expect(giorgi.call.state.status).toBe("in");
      expect(hears(mariam)).toBe("giorgi1 microphone");
      expect(hears(giorgi)).toBe("mariam1 microphone");
    });

    it("sets up a new connection when the one between the two devices fails", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.media.peerConnections.at(-1)?.fail();
      await h.advanceAsync(SECOND);
      expect(mariam.call.state.connection).toBe("failed");
      await h.advanceAsync(5 * SECOND);

      expect(giorgi.media.peerConnections).toHaveLength(2);
      expect(mariam.call.state.connection).toBe("connected");
      expect(hears(mariam)).toBe("giorgi1 microphone");
      expect(hears(giorgi)).toBe("mariam1 microphone");
    });

    it("comes back by itself after the server restarts", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      h.server.stop(); // Every connection drops and the server forgets the Call.
      await h.advanceAsync(SECOND);
      h.server.start();
      await h.advanceAsync(15 * SECOND);

      expect(mariam.call.state).toMatchObject({ status: "in", other: { mic: true, camera: false } });
      expect(hears(mariam)).toBe("giorgi1 microphone");
      expect(hears(giorgi)).toBe("mariam1 microphone");
    });

    it("keeps showing a Viewer whose device lost its connection in the Call for a few seconds", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.drop();
      await h.advanceAsync(10 * SECOND); // The server noticed the silence after about 6 seconds.
      expect(mariam.call.state).toMatchObject({ other: { mic: true, camera: false }, connection: "waiting" });

      await h.advanceAsync(10 * SECOND);
      expect(mariam.call.state).toMatchObject({ other: null, connection: "waiting" });
    });

    it("shows a Viewer who closed the site as gone from the Call within seconds", async () => {
      const { h, giorgi, mariam } = await bothOnline();
      giorgi.call.join();
      mariam.call.join();
      await h.advanceAsync(SECOND);

      giorgi.closeSite();
      await h.advanceAsync(15 * SECOND);

      expect(mariam.call.state).toMatchObject({ status: "in", other: null, connection: "waiting" });
      expect(hears(mariam)).toBeNull();
    });
  });
});

/** The kinds of WebRTC setup this device received over the realtime connection, in order. */
function signalsReceivedBy(device: TestDevice) {
  return device.received.flatMap((message) => {
    if (message.type !== "call:signal") return [];
    return [message.signal.kind === "description" ? message.signal.description.type : "candidate"];
  });
}

function lastCallState(device: TestDevice) {
  return device.received.findLast((message) => message.type === "call");
}
