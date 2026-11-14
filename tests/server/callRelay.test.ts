import { describe, expect, it } from "vitest";
import { createCallRelay } from "../../server/call/relay";

const SECRET = "test-turn-secret-0123456789";
// 2026-11-14 20:00:00 UTC
const NOW = Date.UTC(2026, 10, 14, 20, 0, 0);
const HOUR = 60 * 60 * 1000;

describe("the Call's relay credentials", () => {
  it("gives a signed-in Viewer STUN and TURN on the configured relay, with coturn's shared-secret credentials", () => {
    const relay = createCallRelay({ env: { TURN_HOST: "turn.watch.example", TURN_SECRET: SECRET }, now: () => NOW });

    expect(relay.iceServersFor("giorgi")).toEqual([
      { urls: "stun:turn.watch.example:3478" },
      {
        urls: ["turn:turn.watch.example:3478?transport=udp", "turn:turn.watch.example:3478?transport=tcp"],
        // Expires six hours from now (1794686400 + 21600); the password is
        // base64(HMAC-SHA1(secret, username)), as computed by `openssl dgst -sha1 -hmac`.
        username: "1794708000:giorgi",
        credential: "kv6FHmk2mN9Yc3VMD1oodLTiudY=",
      },
    ]);
  });

  it("mints credentials that expire six hours after they were asked for", () => {
    let now = NOW;
    const relay = createCallRelay({ env: { TURN_HOST: "turn.watch.example", TURN_SECRET: SECRET }, now: () => now });

    now += 2 * HOUR;
    const [, turn] = relay.iceServersFor("mariam");
    expect(turn?.username).toBe(`${(NOW + 8 * HOUR) / 1000}:mariam`);
  });

  it("uses the port given with the relay address", () => {
    const relay = createCallRelay({ env: { TURN_HOST: "203.0.113.10:3479", TURN_SECRET: SECRET }, now: () => NOW });

    expect(relay.iceServersFor("giorgi").flatMap((server) => server.urls)).toEqual([
      "stun:203.0.113.10:3479",
      "turn:203.0.113.10:3479?transport=udp",
      "turn:203.0.113.10:3479?transport=tcp",
    ]);
  });

  it("offers no ICE servers when no relay is configured, so devices connect directly (local development)", () => {
    const relay = createCallRelay({ env: { TURN_HOST: "", TURN_SECRET: "" }, now: () => NOW });

    expect(relay.iceServersFor("giorgi")).toEqual([]);
  });

  it("refuses a relay address without its secret, or a secret without an address", () => {
    expect(() => createCallRelay({ env: { TURN_HOST: "turn.watch.example" } })).toThrow(/TURN_SECRET/);
    expect(() => createCallRelay({ env: { TURN_SECRET: SECRET } })).toThrow(/TURN_HOST/);
  });

  it("refuses a relay address that is not a host name or IP address with an optional port", () => {
    expect(() => createCallRelay({ env: { TURN_HOST: "turn:turn.watch.example", TURN_SECRET: SECRET } })).toThrow(
      /TURN_HOST/,
    );
    expect(() => createCallRelay({ env: { TURN_HOST: "turn.watch.example:99999", TURN_SECRET: SECRET } })).toThrow(
      /TURN_HOST/,
    );
  });
});
