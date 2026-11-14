/**
 * The Call, on a device: joining and leaving, this device's microphone and
 * camera, and the peer connection to the other Viewer's Call device.
 * Framework-free: the browser's media and WebRTC come in as a
 * `CallPlatform`, so seam 1 tests run it on fakes. Vue reaches it through
 * `useCall()` (`composables/useCall.ts`).
 *
 * Independent of any Watch Party: nothing here starts, follows or leaves one.
 */
import { otherViewer, type Viewer } from "../../models/Viewer";
import type { Clock } from "../clock";
import type { DeviceClient } from "../deviceClient";
import { emptySlots, openCallPeer, type CallPeer } from "./peer";
import type { CallPlatform, MediaTrack } from "./platform";
import { CALL_SLOTS, type CallLink, type CallMedia, type CallSlot } from "./protocol";

/**
 * Why a microphone or camera could not start:
 * - `blocked`: the Viewer or the browser denied access
 * - `not-found`: there is no such device
 * - `in-use`: another app holds it, or the system blocks it
 * - `unsupported`: this browser or page cannot use it (e.g. not HTTPS)
 * - `failed`: anything else
 */
export type MediaProblem = "blocked" | "not-found" | "in-use" | "unsupported" | "failed";

export interface CallState {
  /** `out`: not in the Call on this device. `joining`: asking for the microphone. `in`: in the Call. */
  status: "out" | "joining" | "in";
  /** This device left the Call because its Viewer joined from another device; until it joins again. */
  continuedElsewhere: boolean;
  /** This device is out of the Call, and its Viewer is in it on another of their devices. */
  inCallElsewhere: boolean;
  /** The other Viewer's microphone and camera while they are in the Call; null when they are not. */
  other: CallMedia | null;
  /** This device's microphone: on (sending), and why it could not start. */
  mic: { on: boolean; problem: MediaProblem | null };
  camera: { on: boolean; problem: MediaProblem | null };
  /**
   * The connection to the other Viewer's Call device. `waiting`: there is
   * none, because the other Viewer is not in the Call (or this device is not).
   */
  connection: "waiting" | "connecting" | "connected" | "failed";
  /** What this device sends, by slot (the camera for the self view). */
  local: Readonly<Record<CallSlot, MediaTrack | null>>;
  /** What the other Viewer's Call device sends, by slot. */
  remote: Readonly<Record<CallSlot, MediaTrack | null>>;
}

export interface DeviceCall {
  readonly state: CallState;
  /**
   * Joins the Call from this device, microphone on and camera off. A Viewer
   * is in the Call on one device at a time: joining here takes the Call over
   * from their other device. Without the microphone (blocked, missing), it
   * still joins, to listen.
   */
  join(): Promise<void>;
  /** Leaves the Call on this device. */
  leave(): void;
  /**
   * Unmutes (true) or mutes (false) the microphone, without renegotiating.
   * Turning on a microphone that could not start asks for it again.
   */
  setMic(on: boolean): Promise<void>;
  /** Turns the camera on or off. Off releases it, so its light goes off. */
  setCamera(on: boolean): Promise<void>;
  /** Calls `listener` after every change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** How long after its connection failed a device asks for a new one. */
const RELINK_DELAY_MS = 2000;

export function createDeviceCall(client: DeviceClient, platform: CallPlatform, clock: Clock): DeviceCall {
  const listeners = new Set<() => void>();
  let status: CallState["status"] = "out";
  let viewers: Record<Viewer, CallMedia | null> | null = null;
  let joinId: string | null = null;
  let joinCount = 0;
  /** Whether the next `call:join` takes the Call over; until the server confirms this join. */
  let takeOver = false;
  let continuedElsewhere = false;
  const local = emptySlots<MediaTrack>();
  const problems = emptySlots<MediaProblem>();
  /** Counts changes to each slot, so a microphone or camera granted after a newer change is dropped. */
  const requests = Object.fromEntries(CALL_SLOTS.map(({ slot }) => [slot, 0])) as Record<CallSlot, number>;
  let peer: CallPeer | null = null;

  function changed() {
    for (const listener of listeners) listener();
  }

  function media(): CallMedia {
    return { mic: !!local.mic?.enabled, camera: !!local.camera };
  }

  function sendJoin() {
    if (joinId) client.send({ type: "call:join", joinId, media: media(), takeOver });
  }

  /** Tells the other Viewer about this device's microphone and camera (until joined, the join says it). */
  function sendMedia() {
    if (status === "in") client.send({ type: "call:media", media: media() });
  }

  /**
   * Asks the platform for a microphone or camera. A newer change to the slot
   * (turned off, left the Call) while the browser asks wins: the track that
   * comes too late is released at once.
   */
  async function start(slot: CallSlot, open: () => Promise<MediaTrack>) {
    const request = ++requests[slot];
    try {
      const track = await open();
      if (request !== requests[slot]) return track.stop();
      setLocal(slot, track);
      problems[slot] = null;
    } catch (error) {
      if (request === requests[slot]) problems[slot] = mediaProblemOf(error);
    }
  }

  function setLocal(slot: CallSlot, track: MediaTrack | null) {
    requests[slot] += 1;
    const previous = local[slot];
    if (previous === track) return;
    previous?.stop();
    local[slot] = track;
    peer?.replaceTrack(slot, track);
  }

  /** Out of the Call on this device: no connection, microphone and camera released. */
  function stop() {
    status = "out";
    joinId = null;
    takeOver = false;
    setLink(null);
    for (const slot of Object.keys(local) as CallSlot[]) {
      setLocal(slot, null);
      problems[slot] = null;
    }
  }

  function setLink(link: CallLink | null) {
    if (peer && peer.link === link?.id) return;
    peer?.close();
    peer = null;
    if (!link) return;
    const opened: CallPeer = openCallPeer({
      link,
      platform,
      localTrack: (slot) => local[slot],
      signal(signal) {
        client.send({ type: "call:signal", link: link.id, signal });
      },
      changed() {
        if (peer === opened) changed();
      },
      failed() {
        // Ask for a new link, after a pause so a connection that keeps failing at once does not spin.
        clock.setTimeout(() => {
          if (peer === opened) client.send({ type: "call:relink", link: link.id });
        }, RELINK_DELAY_MS);
      },
    });
    peer = opened;
  }

  client.on("call", (message) => {
    viewers = message.viewers;
    const me = client.identity?.viewer;
    // Its Viewer is no longer in the Call anywhere: nothing continues elsewhere.
    if (me && !viewers[me]) continuedElsewhere = false;
    const confirmed = status === "in" && joinId !== null && message.joinId === joinId;
    if (confirmed) takeOver = false;
    setLink(confirmed ? message.link : null);
    changed();
  });

  // A new connection starts with this device out of the Call on the server:
  // rejoin, unless another device of this Viewer took the Call over meanwhile.
  client.on("welcome", () => {
    if (status === "in") sendJoin();
  });

  client.on("call:continued-elsewhere", (message) => {
    if (status === "out" || message.joinId !== joinId) return;
    stop();
    continuedElsewhere = true;
    changed();
  });

  client.on("call:signal", (message) => {
    if (peer?.link === message.link) peer.receive(message.signal);
  });

  return {
    get state(): CallState {
      const me = client.identity?.viewer;
      return {
        status,
        continuedElsewhere,
        inCallElsewhere: status === "out" && !!me && !!viewers?.[me],
        other: viewers && me ? viewers[otherViewer(me)] : null,
        mic: { on: !!local.mic?.enabled, problem: problems.mic },
        camera: { on: !!local.camera, problem: problems.camera },
        connection: peer ? peer.status : "waiting",
        local: { ...local },
        remote: peer ? { ...peer.remote } : emptySlots(),
      };
    },

    async join() {
      const identity = client.identity;
      if (status !== "out" || !identity) return;
      status = "joining";
      continuedElsewhere = false;
      joinId = `${identity.deviceId}/${++joinCount}`;
      takeOver = true;
      changed();
      await start("mic", () => platform.getMicrophone());
      if (status !== "joining") return;
      status = "in";
      sendJoin();
      changed();
    },

    leave() {
      if (status === "out") return;
      const wasIn = status === "in";
      stop();
      if (wasIn) client.send({ type: "call:leave" });
      changed();
    },

    async setMic(on) {
      if (status === "out") return;
      if (local.mic) {
        local.mic.enabled = on;
      } else if (on) {
        await start("mic", () => platform.getMicrophone());
      }
      sendMedia();
      changed();
    },

    async setCamera(on) {
      if (status === "out") return;
      if (!on) {
        setLocal("camera", null);
        problems.camera = null;
      } else if (!local.camera) {
        await start("camera", () => platform.getCamera());
      }
      sendMedia();
      changed();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function mediaProblemOf(error: unknown): MediaProblem {
  const name = (error as { name?: unknown } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "blocked";
    case "NotFoundError":
    case "OverconstrainedError":
      return "not-found";
    case "NotReadableError":
      return "in-use";
    case "NotSupportedError":
    case "TypeError":
      return "unsupported";
    default:
      return "failed";
  }
}
