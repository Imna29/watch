/**
 * The coordinator: the server's single authority over realtime state
 * (presence now; the Watch Party and Call routing later). Framework-free and
 * transport-agnostic: the WebSocket handler (`server/routes/realtime.ts`), or
 * a test's fake network, feeds it devices connecting and disconnecting,
 * messages from devices and clock ticks, and carries out what it returns. It
 * never touches sockets or timers itself.
 *
 * The core keeps the registry of connected devices and runs the connection
 * protocol (welcome, ping/pong, dropping devices that went silent).
 * Everything else is a `RealtimeFeature` in its own module, owning its own
 * state and device message types; `realtime/server.ts` lists them.
 */
import { z } from "zod";
import type { Viewer } from "../models/Viewer";
import { SILENCE_LIMIT_MS, type DeviceKey, type PingMessage } from "./connection/protocol";
import type { DeviceId, DeviceMessageOf, DeviceMessageType, ServerMessage } from "./protocol";

export interface Device {
  /** This connection. */
  readonly id: DeviceId;
  readonly viewer: Viewer;
  /** The Device (browser tab) across its connections: the same after a reconnect or a page reload. */
  readonly key: DeviceKey;
}

/** What the transport must do: send a device a message, or close its connection. */
export type Outgoing =
  | { kind: "send"; to: DeviceId; message: ServerMessage }
  | { kind: "close"; to: DeviceId; reason: string };

/** What a feature can see and do. */
export interface CoordinatorContext {
  /** The server clock, in milliseconds since the epoch. */
  now(): number;
  /** Every connected device, in the order they connected. */
  devices(): readonly Device[];
  send(to: DeviceId, message: ServerMessage): void;
}

export interface MessageHandler<T extends DeviceMessageType> {
  /** Validates the untrusted message; anything that fails it is ignored. */
  schema: z.ZodType<DeviceMessageOf<T>>;
  handle(from: Device, message: DeviceMessageOf<T>): void;
}

export type MessageHandlers = { [T in DeviceMessageType]?: MessageHandler<T> };

/**
 * One feature of the realtime system, such as presence. It owns the device
 * message types in `handlers` (no two features may handle the same type), is
 * told about devices connecting and disconnecting (after the registry
 * changed) and about clock ticks, and talks to devices through its
 * `CoordinatorContext`.
 */
export interface RealtimeFeature {
  handlers?: MessageHandlers;
  connected?(device: Device): void;
  disconnected?(device: Device): void;
  tick?(): void;
}

/** Creates a feature for one coordinator. */
export type FeatureFactory = (context: CoordinatorContext) => RealtimeFeature;

export interface CoordinatorOptions {
  now: () => number;
  features: readonly FeatureFactory[];
}

export interface Coordinator {
  /** A device of a signed-in Viewer connected. */
  connected(device: Device): Outgoing[];
  /** A device's connection closed. */
  disconnected(deviceId: DeviceId): Outgoing[];
  /** A message from a device, exactly as received (JSON text, untrusted). */
  received(deviceId: DeviceId, data: string): Outgoing[];
  /** Called by the transport every `TICK_INTERVAL_MS`. */
  tick(): Outgoing[];
}

export function createCoordinator({ now, features: factories }: CoordinatorOptions): Coordinator {
  const devices = new Map<DeviceId, { device: Device; lastHeardAt: number }>();
  let outbox: Outgoing[] = [];

  const context: CoordinatorContext = {
    now,
    devices: () => [...devices.values()].map(({ device }) => device),
    send(to, message) {
      outbox.push({ kind: "send", to, message });
    },
  };

  // The connection's own protocol, handled like a feature's.
  const connection: RealtimeFeature = {
    handlers: {
      ping: {
        schema: pingSchema,
        handle(from, { sentAt }) {
          context.send(from.id, { type: "pong", sentAt, serverTime: now() });
        },
      },
    },
  };

  const features = [connection, ...factories.map((create) => create(context))];
  const handlers = new Map<string, MessageHandler<DeviceMessageType>>();
  for (const feature of features) {
    for (const [type, handler] of Object.entries(feature.handlers ?? {})) {
      if (handlers.has(type)) throw new Error(`Two realtime features handle "${type}" messages.`);
      handlers.set(type, handler as MessageHandler<DeviceMessageType>);
    }
  }

  function flush() {
    const sent = outbox;
    outbox = [];
    return sent;
  }

  function remove(device: Device) {
    devices.delete(device.id);
    for (const feature of features) feature.disconnected?.(device);
  }

  return {
    connected({ id, viewer, key }) {
      if (devices.has(id)) return [];
      const device: Device = { id, viewer, key };
      devices.set(id, { device, lastHeardAt: now() });
      context.send(id, { type: "welcome", deviceId: id, viewer, serverTime: now() });
      for (const feature of features) feature.connected?.(device);
      return flush();
    },

    disconnected(deviceId) {
      const entry = devices.get(deviceId);
      if (entry) remove(entry.device);
      return flush();
    },

    received(deviceId, data) {
      const entry = devices.get(deviceId);
      if (!entry) return [];
      entry.lastHeardAt = now();
      const message = parseJson(data);
      if (!isTypedMessage(message)) return [];
      const handler = handlers.get(message.type);
      const parsed = handler?.schema.safeParse(message);
      if (handler && parsed?.success) handler.handle(entry.device, parsed.data);
      return flush();
    },

    tick() {
      // A device that went silent lost its network without closing: drop it.
      for (const { device, lastHeardAt } of [...devices.values()]) {
        if (now() - lastHeardAt <= SILENCE_LIMIT_MS) continue;
        outbox.push({ kind: "close", to: device.id, reason: "silent" });
        remove(device);
      }
      for (const feature of features) feature.tick?.();
      return flush();
    },
  };
}

const pingSchema = z.object({
  type: z.literal("ping"),
  sentAt: z.number().finite(),
}) satisfies z.ZodType<PingMessage>;

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

function isTypedMessage(value: unknown): value is { type: string } {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}
