/**
 * One peer connection of the Call, between this device and the other
 * Viewer's Call device, for one link. Framework-free, over the injected
 * `CallPlatform`.
 *
 * Only the offerer offers. It creates one transceiver per Call slot
 * (`CALL_SLOTS`); the answerer finds the same transceivers, in the same
 * order, in the offer and sends on them too. Tracks are swapped with
 * `replaceTrack`, so turning the camera on or off never renegotiates.
 *
 * Setting up and every received signal run one after another, in order, so
 * a candidate is never applied before the description it belongs to.
 */
import type { CallPlatform, IceCandidate, MediaTrack, PeerConnection } from "./platform";
import { CALL_SLOTS, type CallLink, type CallSignal, type CallSlot } from "./protocol";

export type PeerConnectionStatus = "connecting" | "connected" | "failed";

export interface CallPeerOptions {
  link: CallLink;
  platform: CallPlatform;
  /** The track this device sends in `slot` now. */
  localTrack(slot: CallSlot): MediaTrack | null;
  /** Sends setup to the other end. */
  signal(signal: CallSignal): void;
  /** The connection's status or remote tracks changed. */
  changed(): void;
  /** The connection failed, or could not be set up: it needs a new link. */
  failed(): void;
}

export interface CallPeer {
  readonly link: string;
  readonly status: PeerConnectionStatus;
  /** The tracks from the other end, by slot; null until known. */
  readonly remote: Readonly<Record<CallSlot, MediaTrack | null>>;
  /** Setup from the other end. */
  receive(signal: CallSignal): void;
  /** Sends `track` (null: nothing) in `slot` from now on. */
  replaceTrack(slot: CallSlot, track: MediaTrack | null): void;
  close(): void;
}

export function emptySlots<T>(): Record<CallSlot, T | null> {
  return Object.fromEntries(CALL_SLOTS.map(({ slot }) => [slot, null])) as Record<CallSlot, T | null>;
}

export function openCallPeer(options: CallPeerOptions): CallPeer {
  const { link, platform } = options;
  let connection: PeerConnection | null = null;
  let closed = false;
  let status: PeerConnectionStatus = "connecting";
  const remote = emptySlots<MediaTrack>();
  /** Candidates that arrived before the remote description. */
  const earlyCandidates: IceCandidate[] = [];
  let queue = Promise.resolve();

  /** Runs `step` after every earlier one, while this peer is open. */
  function enqueue(step: (connection: PeerConnection) => Promise<void>) {
    queue = queue
      .then(() => (closed || !connection ? undefined : step(connection)))
      .catch((error: unknown) => {
        if (closed) return;
        console.warn("Call connection setup failed", error);
        fail();
      });
  }

  function fail() {
    if (status === "failed") return;
    status = "failed";
    options.changed();
    options.failed();
  }

  function sendLocalDescription(connection: PeerConnection) {
    const description = connection.localDescription;
    if (description?.sdp && (description.type === "offer" || description.type === "answer")) {
      options.signal({ kind: "description", description: { type: description.type, sdp: description.sdp } });
    }
  }

  async function setUp() {
    const iceServers = await platform.getIceServers().catch(() => []);
    if (closed) return;
    const created = platform.createPeerConnection(
      { iceServers },
      {
        icecandidate(candidate) {
          if (closed || !candidate?.candidate) return;
          const { sdpMid, sdpMLineIndex, usernameFragment } = candidate;
          options.signal({ kind: "candidate", candidate: { candidate: candidate.candidate, sdpMid, sdpMLineIndex, usernameFragment } });
        },
        connectionstatechange() {
          if (closed) return;
          const state = created.connectionState;
          if (state === "failed") return fail();
          if (status === "failed") return;
          status = state === "connected" ? "connected" : "connecting";
          options.changed();
        },
      },
    );
    connection = created;
    if (!link.offerer) return;

    for (const { slot, kind } of CALL_SLOTS) {
      const transceiver = created.addTransceiver(kind, { direction: "sendrecv" });
      await transceiver.sender.replaceTrack(options.localTrack(slot));
      remote[slot] = transceiver.receiver.track;
    }
    await created.setLocalDescription();
    sendLocalDescription(created);
    options.changed();
  }

  async function answer(connection: PeerConnection, offer: { type: "offer"; sdp: string }) {
    await connection.setRemoteDescription(offer);
    const transceivers = connection.getTransceivers();
    for (const [index, { slot }] of CALL_SLOTS.entries()) {
      const transceiver = transceivers[index];
      if (!transceiver) continue;
      transceiver.direction = "sendrecv";
      await transceiver.sender.replaceTrack(options.localTrack(slot));
      remote[slot] = transceiver.receiver.track;
    }
    await connection.setLocalDescription();
    sendLocalDescription(connection);
  }

  queue = setUp().catch((error: unknown) => {
    if (closed) return;
    console.warn("Call connection setup failed", error);
    fail();
  });

  return {
    link: link.id,

    get status() {
      return status;
    },

    get remote() {
      return remote;
    },

    receive(signal) {
      enqueue(async (connection) => {
        if (signal.kind === "candidate") {
          if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
          else earlyCandidates.push(signal.candidate);
          return;
        }
        const { description } = signal;
        if (description.type === "offer") {
          if (link.offerer) return;
          await answer(connection, { type: "offer", sdp: description.sdp });
        } else {
          if (!link.offerer) return;
          await connection.setRemoteDescription(description);
        }
        for (const candidate of earlyCandidates.splice(0)) await connection.addIceCandidate(candidate);
        options.changed();
      });
    },

    replaceTrack(slot, track) {
      enqueue(async (connection) => {
        const transceiver = connection.getTransceivers()[CALL_SLOTS.findIndex((each) => each.slot === slot)];
        // The answerer's transceivers appear with the offer, which then sends the current track.
        if (transceiver?.direction === "sendrecv") await transceiver.sender.replaceTrack(track);
      });
    },

    close() {
      if (closed) return;
      closed = true;
      connection?.close();
      connection = null;
    },
  };
}
