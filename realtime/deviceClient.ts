/**
 * A device's realtime connection to the server. Framework-free: the socket
 * and the clock are injected, so the browser passes a real WebSocket and
 * tests pass a fake network and a fake clock.
 *
 * It reconnects on its own, with growing gaps, whenever the connection drops.
 * Messages sent while disconnected are dropped, not queued: a device module
 * that keeps state on the server sends it again on every `welcome`.
 */
import type { Viewer } from "../models/Viewer";
import type { Clock, TimerId } from "./clock";
import { PING_INTERVAL_MS, SILENCE_LIMIT_MS } from "./connection/protocol";
import type { DeviceId, DeviceMessage, ServerMessage, ServerMessageOf, ServerMessageType } from "./protocol";

/** What a socket reports to the client. */
export interface SocketEvents {
  message(data: string): void;
  /** The connection closed or could not be opened. Fired at most once. */
  close(): void;
}

export interface Socket {
  send(data: string): void;
  close(): void;
}

/** Opens a socket to `url` that reports to `events`. */
export type OpenSocket = (url: string, events: SocketEvents) => Socket;

export interface DeviceClientOptions {
  url: string | (() => string);
  openSocket: OpenSocket;
  clock: Clock;
  /** Wait before the first reconnect; each further attempt waits twice as long, up to `maxRetryMs`. */
  firstRetryMs?: number;
  maxRetryMs?: number;
}

export interface DeviceIdentity {
  deviceId: DeviceId;
  viewer: Viewer;
}

/**
 * - `connecting`: opening a connection, until the server's welcome
 * - `connected`: welcomed by the server
 * - `waiting`: disconnected, waiting to try again
 * - `stopped`: not started, or stopped
 */
export type ConnectionStatus = "connecting" | "connected" | "waiting" | "stopped";

export interface DeviceClient {
  readonly status: ConnectionStatus;
  /** Who this device is, from the server's latest welcome; null before the first one. */
  readonly identity: DeviceIdentity | null;
  /**
   * How far the server's clock is ahead of this device's (negative: behind),
   * estimated with ping/pong; null before the first welcome.
   */
  readonly clockOffsetMs: number | null;
  /**
   * The server's clock now, as best this device knows it. Positions reported
   * by different devices are compared on this one timeline.
   */
  serverNow(): number;
  /** Connects, and keeps reconnecting until `stop()`. Does nothing if already started. */
  start(): void;
  /** Closes the connection and stops reconnecting. */
  stop(): void;
  /** Sends a message now; returns false (and drops it) when not connected. */
  send(message: DeviceMessage): boolean;
  /** Calls `handler` with every message of `type`. Returns a function that stops it. */
  on<T extends ServerMessageType>(type: T, handler: (message: ServerMessageOf<T>) => void): () => void;
  /** Calls `listener` whenever `status` changes. Returns a function that stops it. */
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
}

export function createDeviceClient(options: DeviceClientOptions): DeviceClient {
  const { clock, firstRetryMs = 1000, maxRetryMs = 10_000 } = options;
  const handlers = new Map<ServerMessageType, Set<(message: ServerMessage) => void>>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = "stopped";
  let socket: Socket | null = null;
  let identity: DeviceIdentity | null = null;
  /** Connection attempts since the last welcome. */
  let failedAttempts = 0;
  let retryTimer: TimerId | null = null;
  let pingTimer: TimerId | null = null;
  let silenceTimer: TimerId | null = null;
  const serverClock = createServerClockEstimate();

  function setStatus(next: ConnectionStatus) {
    if (next === status) return;
    status = next;
    for (const listener of statusListeners) listener(status);
  }

  function emit(message: ServerMessage) {
    for (const handler of handlers.get(message.type) ?? []) handler(message);
  }

  function setTimer(timer: TimerId | null, callback: () => void, ms: number) {
    clearTimer(timer);
    return clock.setTimeout(callback, ms);
  }

  function clearTimer(timer: TimerId | null) {
    if (timer !== null) clock.clearTimeout(timer);
    return null;
  }

  function connect() {
    retryTimer = null;
    setStatus("connecting");
    const url = typeof options.url === "function" ? options.url() : options.url;
    const current: Socket = options.openSocket(url, {
      message(data) {
        if (socket !== current) return;
        expectSilenceAtMost();
        const message = parseMessage(data);
        if (!message) return;
        if (message.type === "welcome") {
          identity = { deviceId: message.deviceId, viewer: message.viewer };
          failedAttempts = 0;
          serverClock.roughly(message.serverTime, clock.now());
          setStatus("connected");
          ping();
        } else if (message.type === "pong") {
          serverClock.sample(message.sentAt, message.serverTime, clock.now());
        }
        emit(message);
      },
      close() {
        if (socket !== current) return;
        disconnect();
        retryLater();
      },
    });
    socket = current;
    expectSilenceAtMost();
  }

  /**
   * A connection that hangs while opening, or carries nothing (not even
   * pongs) for this long, is dead even if the browser has not noticed.
   */
  function expectSilenceAtMost() {
    silenceTimer = setTimer(
      silenceTimer,
      () => {
        silenceTimer = null;
        disconnect();
        retryLater();
      },
      SILENCE_LIMIT_MS,
    );
  }

  function ping() {
    socket?.send(JSON.stringify({ type: "ping", sentAt: clock.now() } satisfies DeviceMessage));
    pingTimer = setTimer(pingTimer, ping, PING_INTERVAL_MS);
  }

  /** Closes the current connection, if any, and forgets it. */
  function disconnect() {
    pingTimer = clearTimer(pingTimer);
    silenceTimer = clearTimer(silenceTimer);
    const closing = socket;
    socket = null;
    closing?.close();
  }

  function retryLater() {
    setStatus("waiting");
    const delay = Math.min(maxRetryMs, firstRetryMs * 2 ** failedAttempts);
    failedAttempts += 1;
    retryTimer = setTimer(retryTimer, connect, delay);
  }

  return {
    get status() {
      return status;
    },

    get identity() {
      return identity;
    },

    start() {
      if (status !== "stopped") return;
      connect();
    },

    get clockOffsetMs() {
      return serverClock.offsetMs;
    },

    serverNow() {
      return clock.now() + (serverClock.offsetMs ?? 0);
    },

    stop() {
      retryTimer = clearTimer(retryTimer);
      disconnect();
      failedAttempts = 0;
      setStatus("stopped");
    },

    send(message) {
      if (status !== "connected" || !socket) return false;
      socket.send(JSON.stringify(message));
      return true;
    },

    on(type, handler) {
      const set = handlers.get(type) ?? new Set();
      handlers.set(type, set);
      const listener = handler as (message: ServerMessage) => void;
      set.add(listener);
      return () => set.delete(listener);
    },

    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
  };
}

/** How many recent pongs the estimate picks from. */
const CLOCK_SAMPLES = 8;

/**
 * The server clock's offset from this device's, NTP-style: a pong answered
 * at `serverTime` arrived one round trip after its ping left, so the server
 * read its clock about half a round trip before the pong arrived. The pong
 * with the shortest round trip among the recent ones is the most accurate.
 */
function createServerClockEstimate() {
  let samples: { roundTripMs: number; offsetMs: number }[] = [];
  let offsetMs: number | null = null;

  return {
    get offsetMs() {
      return offsetMs;
    },

    /** Before any pong: assume the welcome took no time to arrive. */
    roughly(serverTime: number, now: number) {
      if (offsetMs === null) offsetMs = serverTime - now;
    },

    sample(sentAt: number, serverTime: number, now: number) {
      const roundTripMs = now - sentAt;
      if (roundTripMs < 0) return;
      samples = [...samples, { roundTripMs, offsetMs: serverTime + roundTripMs / 2 - now }].slice(-CLOCK_SAMPLES);
      const best = samples.reduce((a, b) => (b.roundTripMs < a.roundTripMs ? b : a));
      offsetMs = best.offsetMs;
    },
  };
}

function parseMessage(data: string): ServerMessage | null {
  try {
    const message = JSON.parse(data);
    return typeof message?.type === "string" ? (message as ServerMessage) : null;
  } catch {
    return null;
  }
}
