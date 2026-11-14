/**
 * The browser's media and WebRTC, as the Call's `CallPlatform`. Used by the
 * browser plugin (`plugins/realtime.client.ts`) only: tests pass fakes.
 */
import type { CallPlatform, MediaTrack } from "./platform";
import { CALL_ICE_SERVERS_PATH, type IceServersResponse } from "./protocol";

/** Asks for one track. Without `navigator.mediaDevices` (not HTTPS) it rejects with `NotSupportedError`. */
async function openTrack(constraints: MediaStreamConstraints): Promise<MediaTrack> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Camera and microphone need HTTPS", "NotSupportedError");
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const [track] = stream.getTracks();
  if (!track) throw new DOMException("No track", "NotFoundError");
  return track;
}

export const browserCallPlatform: CallPlatform = {
  // Microphone and camera are asked for separately, so a blocked camera never
  // takes the microphone with it.
  getMicrophone: () =>
    openTrack({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),

  // Small tiles: a modest resolution keeps the bandwidth for the movie.
  getCamera: () =>
    openTrack({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
    }),

  async getIceServers() {
    const response = await fetch(CALL_ICE_SERVERS_PATH, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`ICE servers: HTTP ${response.status}`);
    const { iceServers } = (await response.json()) as IceServersResponse;
    return iceServers;
  },

  createPeerConnection(config, events) {
    const connection = new RTCPeerConnection(config);
    connection.onicecandidate = (event) => events.icecandidate(event.candidate);
    connection.onconnectionstatechange = () => events.connectionstatechange();
    return connection;
  },
};
