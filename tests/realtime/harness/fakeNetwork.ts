/**
 * A fake in-memory network between devices and the server, on a fake clock.
 * The server end runs the real coordinator, the way the WebSocket handler in
 * `server/routes/realtime.ts` does: it feeds the coordinator connections,
 * messages, disconnections and ticks, and delivers what it returns.
 *
 * Each device has its own link, which a test can slow down (`delayMs`, each
 * way) or drop: a dropped link silently loses everything, in both
 * directions, like a pulled cable. Nobody is told; both ends must notice.
 */
import type { Viewer } from "../../../models/Viewer";
import type { Coordinator, Outgoing } from "../../../realtime/coordinator";
import type { OpenSocket, SocketEvents } from "../../../realtime/deviceClient";
import type { DeviceId, ServerMessage } from "../../../realtime/protocol";
import { createRealtimeCoordinator, TICK_INTERVAL_MS, type RealtimeServerOptions } from "../../../realtime/server";
import type { FakeClock } from "./fakeClock";

export interface Link {
  /** One-way delay, in milliseconds. */
  delayMs: number;
  dropped: boolean;
}

/** What the network sees of one device. */
export interface DeviceTraffic {
  /** Every message the device received, in order. */
  readonly received: ServerMessage[];
  /** When the device tried to connect, on the server's clock. */
  readonly connectionAttempts: number[];
}

interface Connection {
  id: DeviceId;
  /** The server sends a message to this connection's device. */
  send(data: string): void;
  /** The server closes this connection. */
  close(): void;
}

export interface FakeServer {
  readonly running: boolean;
  /** The server process stops: every connection closes and all realtime state is lost. */
  stop(): void;
  /** A fresh server process starts accepting connections. */
  start(): void;
  /** Opens sockets for one device of `viewer` over `link`, recording its traffic. */
  socketsFor(viewer: Viewer, link: Link, traffic: DeviceTraffic & { name: string }): OpenSocket;
}

/** Starts a fake server whose coordinator runs on `clock` with `options`. */
export function createFakeServer(clock: FakeClock, options: Omit<RealtimeServerOptions, "now">): FakeServer {
  let coordinator: Coordinator | null = null;
  let ticker: unknown;
  const connections = new Map<DeviceId, Connection>();
  let connectionCount = 0;

  function deliver(outgoing: Outgoing[]) {
    for (const out of outgoing) {
      const connection = connections.get(out.to);
      if (out.kind === "send") connection?.send(JSON.stringify(out.message));
      else connection?.close();
    }
  }

  function scheduleTick() {
    ticker = clock.setTimeout(() => {
      if (coordinator) deliver(coordinator.tick());
      scheduleTick();
    }, TICK_INTERVAL_MS);
  }

  const server: FakeServer = {
    get running() {
      return coordinator !== null;
    },

    start() {
      if (coordinator) return;
      coordinator = createRealtimeCoordinator({ ...options, now: clock.now });
      scheduleTick();
    },

    stop() {
      if (!coordinator) return;
      coordinator = null;
      clock.clearTimeout(ticker);
      for (const connection of [...connections.values()]) connection.close();
      connections.clear();
    },

    socketsFor(viewer, link, traffic) {
      // Runs `deliver` after the link's delay, unless the link is dropped by then.
      function across(deliver: () => void) {
        if (link.dropped) return;
        clock.setTimeout(() => {
          if (!link.dropped) deliver();
        }, link.delayMs);
      }

      return (_url: string, events: SocketEvents) => {
        traffic.connectionAttempts.push(clock.now());
        // The device stops hearing from a socket once it closed it, or after its close event.
        let finished = false;
        let connection: Connection | null = null;

        function toDevice(deliver: () => void) {
          across(() => {
            if (!finished) deliver();
          });
        }

        function closeToDevice() {
          toDevice(() => {
            finished = true;
            events.close();
          });
        }

        across(() => {
          if (finished) return;
          if (!coordinator) {
            closeToDevice(); // Connection refused.
            return;
          }
          const id = `${traffic.name}-${++connectionCount}`;
          const current: Connection = {
            id,
            send(data) {
              toDevice(() => {
                traffic.received.push(JSON.parse(data));
                events.message(data);
              });
            },
            close() {
              connections.delete(id);
              closeToDevice();
            },
          };
          connection = current;
          connections.set(id, current);
          deliver(coordinator.connected({ id, viewer }));
        });

        return {
          send(data) {
            if (finished) return;
            across(() => {
              if (coordinator && connection && connections.get(connection.id) === connection) {
                deliver(coordinator.received(connection.id, data));
              }
            });
          },
          close() {
            if (finished) return;
            finished = true;
            across(() => {
              if (coordinator && connection && connections.get(connection.id) === connection) {
                connections.delete(connection.id);
                deliver(coordinator.disconnected(connection.id));
              }
            });
          },
        };
      };
    },
  };

  server.start();
  return server;
}
