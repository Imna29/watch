/**
 * What the Call needs from the browser, injected so the Call's device module
 * stays framework-free: the browser passes `browserCallPlatform`
 * (`realtime/call/browserPlatform.ts`), and seam 1 tests pass fakes
 * (`tests/realtime/harness/fakeMedia.ts`).
 *
 * The interfaces are the small parts of `MediaStreamTrack` and
 * `RTCPeerConnection` the Call uses, so the real objects satisfy them as
 * they are.
 */
import type { IceServer } from "./protocol";

/** A microphone, camera or remote track (`MediaStreamTrack`). */
export interface MediaTrack {
  readonly kind: string;
  /** False: the track sends silence or black frames (mute, push-to-talk). */
  enabled: boolean;
  /** Releases the device (the camera light goes off). */
  stop(): void;
}

export interface SessionDescription {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface PeerTransceiver {
  direction: "sendrecv" | "sendonly" | "recvonly" | "inactive" | "stopped";
  readonly sender: { replaceTrack(track: MediaTrack | null): Promise<void> };
  readonly receiver: { readonly track: MediaTrack };
}

/** The parts of `RTCPeerConnection` the Call uses. */
export interface PeerConnection {
  readonly connectionState: "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";
  readonly localDescription: SessionDescription | null;
  readonly remoteDescription: SessionDescription | null;
  addTransceiver(kind: "audio" | "video", init: { direction: "sendrecv" }): PeerTransceiver;
  /** In the order of the session description's media sections, the same on both ends. */
  getTransceivers(): PeerTransceiver[];
  /** Creates and applies an offer or an answer, whichever the state calls for. */
  setLocalDescription(): Promise<void>;
  setRemoteDescription(description: { type: "offer" | "answer"; sdp: string }): Promise<void>;
  addIceCandidate(candidate: IceCandidate): Promise<void>;
  close(): void;
}

/** A peer connection's events (`icecandidate`, `connectionstatechange`). */
export interface PeerConnectionEvents {
  /** A local ICE candidate to send to the other end; null when gathering is complete. */
  icecandidate(candidate: IceCandidate | null): void;
  connectionstatechange(): void;
}

/** A browser tab captured for Tab Share: its picture, and its sound when the browser shares it. */
export interface TabCapture {
  video: MediaTrack;
  /** The tab's sound; null when the browser did not share it (it cannot, or the Viewer unticked it). */
  audio: MediaTrack | null;
  /** Calls `listener` once the capture ends by itself: the Viewer pressed the browser's "Stop sharing". */
  onEnded(listener: () => void): void;
}

export interface CallPlatform {
  /**
   * Asks for the microphone. Rejects like `getUserMedia`, with an error whose
   * `name` says why (`NotAllowedError`, `NotFoundError`, ...).
   */
  getMicrophone(): Promise<MediaTrack>;
  /** Asks for the camera; rejects like `getMicrophone`. */
  getCamera(): Promise<MediaTrack>;
  /**
   * Asks the Viewer for a browser tab to share, with its sound, offering
   * this tab first (`./tabCapture.ts`). Only works from the Viewer's click.
   * Rejects like `getDisplayMedia` (`NotAllowedError` when the Viewer
   * cancels), and with `NotSupportedError` where the browser cannot share a
   * tab at all.
   */
  captureTab(): Promise<TabCapture>;
  /** STUN and TURN servers with fresh relay credentials (`CALL_ICE_SERVERS_PATH`). */
  getIceServers(): Promise<IceServer[]>;
  createPeerConnection(config: { iceServers: IceServer[] }, events: PeerConnectionEvents): PeerConnection;
}
