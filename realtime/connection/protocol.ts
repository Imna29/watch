import type { Viewer } from "../../models/Viewer";

/** The WebSocket endpoint, served by `server/routes/realtime.ts`. */
export const REALTIME_PATH = "/realtime";

/** One connection of one Viewer's device, as named by the server. */
export type DeviceId = string;

/**
 * Names one Device (a browser tab) across its connections: it stays the same
 * when the device reconnects or the page reloads (the browser keeps it in
 * the tab's sessionStorage). The device sends it in the WebSocket URL's
 * `DEVICE_KEY_PARAM`. Only meaningful together with the Viewer.
 */
export type DeviceKey = string;

export const DEVICE_KEY_PARAM = "device";

const DEVICE_KEY_PATTERN = /^[\w-]{1,100}$/;

/** The device key in a realtime WebSocket URL (absolute, or a path); null when it has none or a malformed one. */
export function deviceKeyIn(url: string): DeviceKey | null {
  try {
    const key = new URL(url, "http://localhost").searchParams.get(DEVICE_KEY_PARAM);
    return key !== null && DEVICE_KEY_PATTERN.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** How often a device pings the server, to keep its clock estimate fresh and show it is alive. */
export const PING_INTERVAL_MS = 2000;
/**
 * A connection that has carried nothing for this long is dead, on either side:
 * the server drops the device and the device reconnects. Three missed pings.
 */
export const SILENCE_LIMIT_MS = 3 * PING_INTERVAL_MS;

/** The first message on every connection: who this device is, by the server's clock. */
export interface WelcomeMessage {
  type: "welcome";
  deviceId: DeviceId;
  viewer: Viewer;
  serverTime: number;
}

/** Sent by a device every `PING_INTERVAL_MS`; `sentAt` is the device's own clock. */
export interface PingMessage {
  type: "ping";
  sentAt: number;
}

/** The server's answer to a ping: the ping's `sentAt`, and the server's clock when it answered. */
export interface PongMessage {
  type: "pong";
  sentAt: number;
  serverTime: number;
}

export type ConnectionDeviceMessage = PingMessage;
export type ConnectionServerMessage = WelcomeMessage | PongMessage;
