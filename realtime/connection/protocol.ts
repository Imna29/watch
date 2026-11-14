import type { Viewer } from "../../models/Viewer";

/** One connection of one Viewer's device, as named by the server. */
export type DeviceId = string;

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
