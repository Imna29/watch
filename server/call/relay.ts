/**
 * The Call's relay (coturn, ADR 0003): the STUN and TURN servers a Viewer's
 * device uses for a peer connection. TURN credentials follow coturn's
 * shared-secret scheme (`use-auth-secret` + `static-auth-secret`): the
 * username is `<expiry in unix seconds>:<viewer>` and the password is
 * base64(HMAC-SHA1(secret, username)), so coturn checks them without asking
 * this server. They only gate new relay allocations: a Call that is up keeps
 * its relay after they expire, and every new peer connection fetches fresh
 * ones.
 */
import { createHmac } from "node:crypto";
import type { Viewer } from "../../models/Viewer";
import type { IceServer } from "../../realtime/call/protocol";

/** How long minted TURN credentials can start a relay allocation. */
export const TURN_CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_PORT = 3478;

export interface CallRelayOptions {
  /** Server config, usually `process.env`. */
  env: Record<string, string | undefined>;
  /** Milliseconds since the epoch. Injected so tests can move time. */
  now?: () => number;
}

export interface CallRelay {
  /** The ICE servers for one of `viewer`'s peer connections; empty when no relay is configured. */
  iceServersFor(viewer: Viewer): IceServer[];
}

/**
 * Throws, so the server refuses to start, when the relay is half configured
 * or its address is malformed. With neither `TURN_HOST` nor `TURN_SECRET`,
 * devices only connect directly (enough on one machine or one network).
 */
export function createCallRelay({ env, now = Date.now }: CallRelayOptions): CallRelay {
  const relay = readConfig(env);

  return {
    iceServersFor(viewer) {
      if (!relay) return [];
      const address = `${relay.host}:${relay.port}`;
      const username = `${Math.floor(now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS}:${viewer}`;
      const credential = createHmac("sha1", relay.secret).update(username).digest("base64");
      return [
        { urls: `stun:${address}` },
        {
          urls: [`turn:${address}?transport=udp`, `turn:${address}?transport=tcp`],
          username,
          credential,
        },
      ];
    },
  };
}

// A host name, an IPv4 address or a bracketed IPv6 address, then an optional port.
const HOST_PATTERN = /^(?<host>\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::(?<port>\d{1,5}))?$/;

function readConfig(env: CallRelayOptions["env"]) {
  const address = env.TURN_HOST?.trim() ?? "";
  const secret = env.TURN_SECRET ?? "";
  if (!address && !secret) return null;
  if (!secret) throw new Error("TURN_HOST is set but TURN_SECRET is not: set both (coturn's static-auth-secret) or neither.");
  if (!address) throw new Error("TURN_SECRET is set but TURN_HOST is not: set both or neither.");

  const match = HOST_PATTERN.exec(address);
  const port = match?.groups?.port ? Number(match.groups.port) : DEFAULT_PORT;
  if (!match?.groups?.host || port < 1 || port > 65535) {
    throw new Error(
      `TURN_HOST must be the relay's host name or IP address, optionally with a port (e.g. turn.example.com:3478), not "${address}".`,
    );
  }
  return { host: match.groups.host, port, secret };
}
