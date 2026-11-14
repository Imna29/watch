/**
 * The realtime WebSocket endpoint (`REALTIME_PATH`, ADR 0003). Each
 * connection is one device of one signed-in Viewer. A thin adapter: it feeds
 * the coordinator (`realtime/coordinator.ts`) connections, messages,
 * disconnections and clock ticks, and carries out what it returns.
 *
 * Nitro middleware does not run for WebSocket upgrades, so the upgrade
 * checks the sign-in cookie itself.
 */
import { isViewer } from "~/models/Viewer";
import { deviceKeyIn } from "~/realtime/connection/protocol";
import type { Outgoing } from "~/realtime/coordinator";
import { createRealtimeCoordinator, TICK_INTERVAL_MS } from "~/realtime/server";

interface Connection {
  send(data: string): unknown;
  terminate(): void;
}

const coordinator = createRealtimeCoordinator({
  now: Date.now,
  watchParty: { history: watchPartyHistory },
});
const connections = new Map<string, Connection>();

function carryOut(outgoing: Outgoing[]) {
  for (const out of outgoing) {
    const connection = connections.get(out.to);
    if (!connection) continue;
    if (out.kind === "send") {
      connection.send(JSON.stringify(out.message));
    } else {
      // The device went silent: its connection is dead, so do not wait for a closing handshake.
      connections.delete(out.to);
      connection.terminate();
    }
  }
}

setInterval(() => carryOut(coordinator.tick()), TICK_INTERVAL_MS);

export default defineWebSocketHandler({
  upgrade(request) {
    // Thrown Responses reject the upgrade with that HTTP response.
    const viewer = useViewerSignIn().readViewer(request.headers.get("cookie"));
    if (!viewer) throw new Response("Sign in first", { status: 401 });
    if (!isFromThisSite(request.headers)) throw new Response("Forbidden", { status: 403 });
    request.context.viewer = viewer;
    request.context.deviceKey = deviceKeyIn(request.url);
  },

  open(peer) {
    const viewer = peer.context.viewer;
    if (!isViewer(viewer)) return peer.close(1008, "Sign in first");
    connections.set(peer.id, peer);
    // A device that sent no key is a Device of its own, for this one connection.
    const key = typeof peer.context.deviceKey === "string" ? peer.context.deviceKey : peer.id;
    carryOut(coordinator.connected({ id: peer.id, viewer, key }));
  },

  message(peer, message) {
    carryOut(coordinator.received(peer.id, message.text()));
  },

  close(peer) {
    connections.delete(peer.id);
    carryOut(coordinator.disconnected(peer.id));
  },

  error(peer, error) {
    console.error(`Realtime connection ${peer.id} failed`, error);
  },
});

/**
 * Browsers always send `Origin` on a WebSocket handshake. The SameSite=Lax
 * cookie already keeps other sites out; this also keeps out other origins
 * of the same site (another subdomain).
 */
function isFromThisSite(headers: Headers) {
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    return false;
  }
}
