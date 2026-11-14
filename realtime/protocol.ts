/**
 * The realtime protocol: every message a device and the server exchange over
 * the WebSocket, as JSON. Each feature declares its messages in its own
 * `realtime/<feature>/protocol.ts` and adds them to the two unions below.
 *
 * Message types are namespaced by feature (`presence:watching`), except the
 * connection's own `welcome`, `ping` and `pong`.
 */
import type { CallDeviceMessage, CallServerMessage } from "./call/protocol";
import type { ConnectionDeviceMessage, ConnectionServerMessage } from "./connection/protocol";
import type { PresenceDeviceMessage, PresenceServerMessage } from "./presence/protocol";
import type { WatchPartyDeviceMessage, WatchPartyServerMessage } from "./watchParty/protocol";

export type { DeviceId } from "./connection/protocol";

/** Everything a device may send the server. */
export type DeviceMessage =
  | ConnectionDeviceMessage
  | PresenceDeviceMessage
  | WatchPartyDeviceMessage
  | CallDeviceMessage;

/** Everything the server may send a device. */
export type ServerMessage =
  | ConnectionServerMessage
  | PresenceServerMessage
  | WatchPartyServerMessage
  | CallServerMessage;

export type DeviceMessageType = DeviceMessage["type"];
export type ServerMessageType = ServerMessage["type"];
export type DeviceMessageOf<T extends DeviceMessageType> = Extract<DeviceMessage, { type: T }>;
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>;
