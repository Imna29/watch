import type { Viewer } from "../../models/Viewer";

/**
 * Where a device gets the STUN and TURN servers for a peer connection, with
 * fresh relay credentials (`server/api/call/ice-servers.get.ts`). Answers
 * `IceServersResponse`.
 */
export const CALL_ICE_SERVERS_PATH = "/api/call/ice-servers";

/** One STUN or TURN server, as `RTCPeerConnection` takes it. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServer[];
}

/**
 * What a Call device sends, one track per slot, in this order. Each peer
 * connection carries one transceiver per slot, so turning the camera on or
 * off swaps a track without renegotiating, and each side knows which remote
 * track is which by its position. Tab Share sends the shared tab's picture
 * and sound in the last two (`./tabCapture.ts`).
 */
export const CALL_SLOTS = [
  { slot: "mic", kind: "audio" },
  { slot: "camera", kind: "video" },
  { slot: "tabVideo", kind: "video" },
  { slot: "tabAudio", kind: "audio" },
] as const;

export type CallSlot = (typeof CALL_SLOTS)[number]["slot"];

/** Whether a Viewer's microphone and camera are on. */
export interface CallMedia {
  mic: boolean;
  camera: boolean;
}

/**
 * The peer connection between the two Viewers' Call devices, as one of them
 * sees it. A new id means a new connection: the pair of devices changed, or
 * the last connection failed.
 */
export interface CallLink {
  id: string;
  /** Whether this device makes the offer; the other device answers. */
  offerer: boolean;
}

/**
 * WebRTC setup, relayed between the two devices of a link. The shapes match
 * `RTCSessionDescriptionInit` and `RTCIceCandidateInit`.
 */
export type CallSignal =
  | { kind: "description"; description: { type: "offer" | "answer"; sdp: string } }
  | {
      kind: "candidate";
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };

/**
 * A device joins the Call. A fresh join (`takeOver`) takes the Call over from
 * the Viewer's other device. A device that was in the Call and reconnected
 * rejoins with the same `joinId` and no `takeOver`: that only succeeds while
 * no other device of the Viewer took the Call over in the meantime.
 */
export interface CallJoinMessage {
  type: "call:join";
  /** Names this join of the Call from this device, across reconnects. */
  joinId: string;
  media: CallMedia;
  takeOver: boolean;
}

/** The Viewer's Call device leaves the Call. */
export interface CallLeaveMessage {
  type: "call:leave";
}

/** The Viewer's Call device turned its microphone or camera on or off. */
export interface CallMediaMessage {
  type: "call:media";
  media: CallMedia;
}

/**
 * WebRTC setup for the other end of `link`. From a device: relayed to the
 * other Viewer's Call device, and only while `link` is current. To a device:
 * from the other end of `link`.
 */
export interface CallSignalMessage {
  type: "call:signal";
  link: string;
  signal: CallSignal;
}

/** The peer connection of `link` failed: both devices set up a new one. */
export interface CallRelinkMessage {
  type: "call:relink";
  link: string;
}

/** The Call as one device sees it. Sent to every device as it connects, and whenever its view changes. */
export interface CallMessage {
  type: "call";
  /** Each Viewer's microphone and camera while they are in the Call; null when they are not. */
  viewers: Record<Viewer, CallMedia | null>;
  /** The join this device holds when it is its Viewer's Call device; null otherwise. */
  joinId: string | null;
  /** While this device and the other Viewer's Call device are both in the Call: the connection between them. */
  link: CallLink | null;
}

/** This device was its Viewer's Call device until another of their devices took the Call over. */
export interface CallContinuedElsewhereMessage {
  type: "call:continued-elsewhere";
  joinId: string;
}

export type CallDeviceMessage =
  | CallJoinMessage
  | CallLeaveMessage
  | CallMediaMessage
  | CallSignalMessage
  | CallRelinkMessage;

export type CallServerMessage = CallMessage | CallContinuedElsewhereMessage | CallSignalMessage;
