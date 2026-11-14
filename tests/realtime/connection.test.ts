import { describe, expect, it } from "vitest";
import { createHarness, SECOND } from "./harness";

describe("the realtime connection", () => {
  it("reconnects after the server restarts, so the Viewers see each other again", () => {
    const h = createHarness();
    const mariam = h.device("mariam");
    h.device("giorgi");
    h.advance(SECOND);

    h.server.stop();
    h.advance(3 * SECOND);
    // Cut off, a device no longer claims to know who is online.
    expect(mariam.presence.other).toBeNull();

    h.server.start();
    h.advance(10 * SECOND);
    expect(mariam.presence.other).toEqual({ viewer: "giorgi", online: true, watching: null });
  });

  it("retries quickly at first, then less and less often, while the server stays down", () => {
    const h = createHarness();
    const laptop = h.device("giorgi");
    h.advance(SECOND);

    const stoppedAt = h.clock.now();
    h.server.stop();
    h.advance(60 * SECOND);

    const retries = laptop.connectionAttempts.slice(1);
    expect(retries[0]! - stoppedAt).toBeLessThanOrEqual(1.1 * SECOND);
    const gaps = retries.slice(1).map((at, i) => at - retries[i]!);
    // About 1s, 2s, 4s, 8s, then every 10s.
    expect(gaps.length).toBeGreaterThanOrEqual(6);
    expect(gaps.slice(0, 4).every((gap, i) => i === 0 || gap > gaps[i - 1]!)).toBe(true);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(10.1 * SECOND);
    expect(Math.min(...gaps.slice(-2))).toBeGreaterThanOrEqual(10 * SECOND);
  });

  it("connects again within seconds once the server is back after a long outage", () => {
    const h = createHarness();
    const mariam = h.device("mariam");
    h.device("giorgi");
    h.advance(SECOND);

    h.server.stop();
    h.advance(5 * 60 * SECOND);
    h.server.start();
    h.advance(11 * SECOND);
    expect(mariam.presence.other?.online).toBe(true);
  });

  it("stays up while nothing happens", () => {
    const h = createHarness();
    const mariam = h.device("mariam");
    const giorgi = h.device("giorgi");
    h.advance(10 * 60 * SECOND);

    expect(mariam.presence.other?.online).toBe(true);
    expect(mariam.connectionAttempts).toHaveLength(1);
    expect(giorgi.connectionAttempts).toHaveLength(1);
  });

  describe("when a device's network silently drops", () => {
    it("shows that Viewer offline within seconds", () => {
      const h = createHarness();
      const mariam = h.device("mariam");
      const giorgi = h.device("giorgi");
      h.advance(SECOND);

      giorgi.drop();
      h.advance(10 * SECOND);
      expect(mariam.presence.other?.online).toBe(false);
      // The dropped device knows it is cut off.
      expect(giorgi.presence.other).toBeNull();
    });

    it("reconnects once the network is back", () => {
      const h = createHarness();
      const mariam = h.device("mariam");
      const giorgi = h.device("giorgi");
      h.advance(SECOND);
      giorgi.drop();
      h.advance(30 * SECOND);

      giorgi.restore();
      h.advance(12 * SECOND);
      expect(mariam.presence.other?.online).toBe(true);
      expect(giorgi.presence.other).toEqual({ viewer: "mariam", online: true, watching: null });
    });
  });
});

describe("the server clock, as a device knows it", () => {
  it("is accurate on a device whose own clock is minutes off, over a slow network", () => {
    const h = createHarness();
    const laptop = h.device("giorgi", { clockSkewMs: -5 * 60 * SECOND, delayMs: 150 });
    const phone = h.device("mariam", { clockSkewMs: 42 * SECOND, delayMs: 40 });
    h.advance(2 * SECOND);

    expect(Math.abs(laptop.client.serverNow() - h.clock.now())).toBeLessThanOrEqual(5);
    expect(Math.abs(phone.client.serverNow() - h.clock.now())).toBeLessThanOrEqual(5);
  });

  it("stays accurate as time goes on and the network gets slower", () => {
    const h = createHarness();
    const laptop = h.device("giorgi", { clockSkewMs: 90 * SECOND, delayMs: 30 });
    h.advance(5 * SECOND);
    laptop.setDelay(400);
    h.advance(60 * SECOND);

    expect(Math.abs(laptop.client.serverNow() - h.clock.now())).toBeLessThanOrEqual(5);
  });
});
