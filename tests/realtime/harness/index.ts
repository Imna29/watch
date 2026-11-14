/**
 * Seam 1, the Watch Party simulation: the real coordinator and real devices
 * (`createRealtimeDevice`, as the browser builds them), wired through a fake
 * in-memory network on a fake clock the test advances.
 *
 * ```ts
 * const h = createHarness();
 * const laptop = h.device("giorgi");
 * const phone = h.device("mariam", { delayMs: 150 });
 * h.advance(SECOND);
 * expect(phone.presence.other?.online).toBe(true);
 * laptop.drop(); // the laptop's network silently goes away
 * ```
 */
import type { Viewer } from "../../../models/Viewer";
import { createRealtimeDevice, type RealtimeDevice } from "../../../realtime/device";
import { createFakeClock } from "./fakeClock";
import { createFakeServer, type DeviceTraffic, type Link } from "./fakeNetwork";

export const SECOND = 1000;

/** One-way network delay of a device unless the test says otherwise. */
const DEFAULT_DELAY_MS = 20;

export interface TestDeviceOptions {
  /** How far ahead this device's own clock is (negative: behind). */
  clockSkewMs?: number;
  /** One-way network delay, in milliseconds. */
  delayMs?: number;
}

export interface TestDevice extends RealtimeDevice, DeviceTraffic {
  readonly name: string;
  readonly viewer: Viewer;
  /** The Viewer closes the site on this device (or the browser tab, or the browser). */
  closeSite(): void;
  /** Changes this device's one-way network delay. */
  setDelay(ms: number): void;
  /** This device's network silently stops carrying anything, both ways. */
  drop(): void;
  /** This device's network works again. */
  restore(): void;
}

export function createHarness() {
  const clock = createFakeClock();
  const server = createFakeServer(clock);
  const counts: Partial<Record<Viewer, number>> = {};

  return {
    clock,
    /** The server process: `stop()` and `start()` it to simulate a restart. */
    server,

    /** Moves time forward; every device and the server act on the way. */
    advance(ms: number) {
      clock.advance(ms);
    },

    /** A new device of `viewer`, signed in and connecting. */
    device(viewer: Viewer, options: TestDeviceOptions = {}): TestDevice {
      counts[viewer] = (counts[viewer] ?? 0) + 1;
      const name = `${viewer}${counts[viewer]}`;
      const link: Link = { delayMs: options.delayMs ?? DEFAULT_DELAY_MS, dropped: false };
      const traffic = { name, received: [], connectionAttempts: [] };
      const device = createRealtimeDevice({
        url: "ws://watch.test/realtime",
        openSocket: server.socketsFor(viewer, link, traffic),
        clock: clock.skewed(options.clockSkewMs ?? 0),
      });
      device.client.start();
      return {
        ...device,
        name,
        viewer,
        received: traffic.received,
        connectionAttempts: traffic.connectionAttempts,
        closeSite() {
          device.client.stop();
        },
        setDelay(ms) {
          link.delayMs = ms;
        },
        drop() {
          link.dropped = true;
        },
        restore() {
          link.dropped = false;
        },
      };
    },
  };
}

export type Harness = ReturnType<typeof createHarness>;
