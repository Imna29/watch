/**
 * Fake browser media for the Call: microphones, cameras and peer
 * connections, so seam 1 runs the real Call device modules without WebRTC.
 *
 * Fake peer connections follow the offer/answer rules of `RTCPeerConnection`
 * closely enough to catch setup mistakes (descriptions in the wrong state,
 * candidates before the remote description). Their session descriptions
 * name the connection that made them, and two connections that applied
 * each other's descriptions and at least one candidate from each other are
 * connected: from then on each one's receivers carry what the other one's
 * senders send. `source()` on a received track tells which microphone or
 * camera actually reaches it.
 *
 * Events (`icecandidate`, `connectionstatechange`) fire as timers on the
 * device's clock, after the promise that caused them settled, as browsers
 * fire them as tasks.
 */
import type { Clock } from "../../../realtime/clock";
import type {
  CallPlatform,
  IceCandidate,
  MediaTrack,
  PeerConnection,
  PeerConnectionEvents,
  PeerTransceiver,
  SessionDescription,
} from "../../../realtime/call/platform";
import type { IceServer } from "../../../realtime/call/protocol";

export const FAKE_ICE_SERVERS: IceServer[] = [{ urls: "stun:turn.watch.test:3478" }];

export class FakeTrack implements MediaTrack {
  enabled = true;
  stopped = false;

  constructor(
    readonly kind: "audio" | "video",
    /** What it is, e.g. "giorgi1 microphone". */
    readonly label: string,
  ) {}

  stop() {
    this.stopped = true;
  }
}

/** A track received over a fake peer connection. */
export class FakeRemoteTrack implements MediaTrack {
  enabled = true;

  constructor(
    readonly kind: "audio" | "video",
    private readonly carried: () => FakeTrack | null,
  ) {}

  /** The microphone or camera whose sound or picture reaches this track right now, if any. */
  source(): FakeTrack | null {
    const track = this.carried();
    return track && !track.stopped && track.enabled ? track : null;
  }

  stop() {}
}

/** The name of the error a browser throws, e.g. "NotAllowedError" when access is blocked. */
export type MediaAccess = "allow" | string;

export interface FakeCallPlatform extends CallPlatform {
  /** What asking for the microphone does from now on. */
  microphone: MediaAccess;
  /** What asking for the camera does from now on. */
  camera: MediaAccess;
  /** How long the browser's permission prompt stays open before the Viewer answers it. */
  promptMs: number;
  /** Every peer connection this device created, oldest first. */
  readonly peerConnections: readonly FakePeerConnection[];
  /** Every microphone and camera track this device was given, oldest first. */
  readonly tracks: readonly FakeTrack[];
}

export interface FakeMediaWorld {
  /** The browser media of one device, on that device's clock. */
  platformFor(deviceName: string, clock: Clock): FakeCallPlatform;
}

export function createFakeMediaWorld(): FakeMediaWorld {
  const connections = new Map<string, FakePeerConnection>();

  return {
    platformFor(deviceName, clock) {
      const peerConnections: FakePeerConnection[] = [];
      const tracks: FakeTrack[] = [];
      let count = 0;

      function open(kind: "audio" | "video", access: MediaAccess, what: string) {
        return new Promise<MediaTrack>((resolve, reject) => {
          function answer() {
            if (access !== "allow") return reject(Object.assign(new Error(`${what}: ${access}`), { name: access }));
            const track = new FakeTrack(kind, `${deviceName} ${what}`);
            tracks.push(track);
            resolve(track);
          }
          if (platform.promptMs > 0) clock.setTimeout(answer, platform.promptMs);
          else answer();
        });
      }

      const platform: FakeCallPlatform = {
        microphone: "allow",
        camera: "allow",
        promptMs: 0,
        peerConnections,
        tracks,
        getMicrophone: () => open("audio", platform.microphone, "microphone"),
        getCamera: () => open("video", platform.camera, "camera"),
        getIceServers: () => Promise.resolve(FAKE_ICE_SERVERS),
        createPeerConnection(config, events) {
          const connection = new FakePeerConnection(`${deviceName}-pc${++count}`, config, events, clock, connections);
          connections.set(connection.id, connection);
          peerConnections.push(connection);
          return connection;
        },
      };
      return platform;
    },
  };
}

interface FakeDescription {
  /** The connection that made it. */
  from: string;
  /** Offers only: the kind of each media section. */
  kinds?: ("audio" | "video")[];
}

class FakeTransceiver implements PeerTransceiver {
  readonly sender: { track: FakeTrack | null; replaceTrack(track: MediaTrack | null): Promise<void> };
  readonly receiver: { readonly track: FakeRemoteTrack };

  constructor(
    readonly kind: "audio" | "video",
    public direction: PeerTransceiver["direction"],
    connection: FakePeerConnection,
  ) {
    this.sender = {
      track: null,
      replaceTrack: async (track) => {
        if (connection.connectionState === "closed") throw domError("InvalidStateError", "closed");
        if (track && track.kind !== kind) throw new TypeError("wrong kind of track");
        this.sender.track = track as FakeTrack | null;
      },
    };
    this.receiver = { track: new FakeRemoteTrack(kind, () => connection.carriedTo(this)) };
  }

  get sends() {
    return this.direction === "sendrecv" || this.direction === "sendonly";
  }

  get receives() {
    return this.direction === "sendrecv" || this.direction === "recvonly";
  }
}

export class FakePeerConnection implements PeerConnection {
  connectionState: PeerConnection["connectionState"] = "new";
  signalingState: "stable" | "have-local-offer" | "have-remote-offer" | "closed" = "stable";
  localDescription: SessionDescription | null = null;
  remoteDescription: SessionDescription | null = null;
  /** The connection whose description this one applied. */
  remoteId: string | null = null;
  readonly remoteCandidates: IceCandidate[] = [];
  private readonly transceivers: FakeTransceiver[] = [];

  constructor(
    readonly id: string,
    readonly config: { iceServers: IceServer[] },
    private readonly events: PeerConnectionEvents,
    private readonly clock: Clock,
    private readonly connections: Map<string, FakePeerConnection>,
  ) {}

  addTransceiver(kind: "audio" | "video", init: { direction: "sendrecv" }) {
    this.assertOpen();
    const transceiver = new FakeTransceiver(kind, init.direction, this);
    this.transceivers.push(transceiver);
    return transceiver;
  }

  getTransceivers() {
    return [...this.transceivers];
  }

  async setLocalDescription() {
    this.assertOpen();
    if (this.signalingState === "stable") {
      const offer: FakeDescription = { from: this.id, kinds: this.transceivers.map((t) => t.kind) };
      this.localDescription = { type: "offer", sdp: JSON.stringify(offer) };
      this.signalingState = "have-local-offer";
    } else if (this.signalingState === "have-remote-offer") {
      const answer: FakeDescription = { from: this.id };
      this.localDescription = { type: "answer", sdp: JSON.stringify(answer) };
      this.signalingState = "stable";
    } else {
      throw domError("InvalidStateError", `setLocalDescription() in ${this.signalingState}`);
    }
    this.later(() => {
      this.events.icecandidate({
        candidate: `candidate:1 1 udp 2122260223 192.0.2.1 50000 typ host ufrag ${this.id}`,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: this.id,
      });
      this.events.icecandidate(null);
    });
    this.update();
  }

  async setRemoteDescription(description: { type: "offer" | "answer"; sdp: string }) {
    this.assertOpen();
    const remote = JSON.parse(description.sdp) as FakeDescription;
    if (description.type === "offer") {
      if (this.signalingState !== "stable") throw domError("InvalidStateError", `offer in ${this.signalingState}`);
      // Like a browser: one transceiver per media section, receiving only until told otherwise.
      for (const [index, kind] of (remote.kinds ?? []).entries()) {
        if (!this.transceivers[index]) this.transceivers.push(new FakeTransceiver(kind, "recvonly", this));
      }
      this.signalingState = "have-remote-offer";
    } else {
      if (this.signalingState !== "have-local-offer") throw domError("InvalidStateError", `answer in ${this.signalingState}`);
      this.signalingState = "stable";
    }
    this.remoteDescription = description;
    this.remoteId = remote.from;
    this.update();
  }

  async addIceCandidate(candidate: IceCandidate) {
    this.assertOpen();
    if (!this.remoteDescription) throw domError("InvalidStateError", "candidate before the remote description");
    this.remoteCandidates.push(candidate);
    this.update();
  }

  close() {
    this.connectionState = "closed";
    this.signalingState = "closed";
    this.peer()?.update();
  }

  /** The network between this connection and its peer fails, on both ends. */
  fail() {
    for (const connection of [this, this.peer()]) {
      if (!connection || connection.connectionState === "closed") continue;
      connection.setConnectionState("failed");
    }
  }

  /** What the other end sends to `transceiver`, while connected. */
  carriedTo(transceiver: FakeTransceiver): FakeTrack | null {
    const peer = this.peer();
    if (this.connectionState !== "connected" || peer?.connectionState !== "connected") return null;
    const sending = peer.transceivers[this.transceivers.indexOf(transceiver)];
    if (!sending?.sends || !transceiver.receives) return null;
    return sending.sender.track;
  }

  /** The connection at the other end, once both applied each other's descriptions. */
  private peer(): FakePeerConnection | null {
    const peer = this.remoteId ? this.connections.get(this.remoteId) : undefined;
    return peer && peer.remoteId === this.id ? peer : null;
  }

  private update() {
    if (this.connectionState === "closed" || this.connectionState === "failed") return;
    const negotiated = this.signalingState === "stable" && !!this.localDescription && !!this.remoteDescription;
    const peer = this.peer();
    const connected =
      negotiated &&
      this.remoteCandidates.length > 0 &&
      !!peer &&
      peer.signalingState === "stable" &&
      peer.remoteCandidates.length > 0;
    if (connected) {
      this.setConnectionState("connected");
      peer.setConnectionState("connected");
    } else if (this.localDescription || this.remoteDescription) {
      this.setConnectionState(this.connectionState === "connected" ? "disconnected" : "connecting");
    }
  }

  private setConnectionState(state: PeerConnection["connectionState"]) {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.later(() => this.events.connectionstatechange());
  }

  private later(callback: () => void) {
    this.clock.setTimeout(() => {
      if (this.connectionState !== "closed") callback();
    }, 0);
  }

  private assertOpen() {
    if (this.connectionState === "closed") throw domError("InvalidStateError", "closed");
  }
}

function domError(name: string, message: string) {
  return Object.assign(new Error(message), { name });
}
