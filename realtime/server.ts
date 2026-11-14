/**
 * The server's realtime system: the coordinator with every feature. Used by
 * the WebSocket handler (`server/routes/realtime.ts`) and by the seam 1 test
 * harness, so both run the same thing. A new feature is added to the list.
 */
import { call } from "./call/coordinator";
import { createCoordinator, type Coordinator } from "./coordinator";
import { presence } from "./presence/coordinator";
import { watchParty, type WatchPartyOptions } from "./watchParty/coordinator";

/** How often the transport calls `coordinator.tick()`. */
export const TICK_INTERVAL_MS = 250;

export interface RealtimeServerOptions {
  /** The server clock, in milliseconds since the epoch. */
  now: () => number;
  watchParty: WatchPartyOptions;
}

export function createRealtimeCoordinator({ now, ...options }: RealtimeServerOptions): Coordinator {
  return createCoordinator({
    now,
    features: [
      presence(),
      watchParty(options.watchParty),
      call(),
    ],
  });
}
