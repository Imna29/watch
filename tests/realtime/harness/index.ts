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
 *
 * A test device is what `createRealtimeDevice` returns (`client`, `presence`,
 * `call`, ...) plus its own clock and network controls, and its fake browser
 * media (`media`: microphone, camera, peer connections). Device-side parts
 * that need more than the connection (party sync with a fake Source player)
 * can be built on `device.client` and `device.clock`.
 *
 * Code that awaits between timers (the Call's media and peer connections)
 * needs `await h.advanceAsync(ms)`, which lets promises settle on the way.
 */
import type { Viewer } from "../../../models/Viewer";
import type { Clock } from "../../../realtime/clock";
import { createRealtimeDevice, type RealtimeDevice } from "../../../realtime/device";
import { createFakeClock } from "./fakeClock";
import { createFakeMediaWorld, type FakeCallPlatform } from "./fakeMedia";
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
  /** This device's own clock (skewed by `clockSkewMs`), on the harness's timeline. */
  readonly clock: Clock;
  /** This device's fake browser media: what its microphone and camera allow, and its peer connections. */
  readonly media: FakeCallPlatform;
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
  const mediaWorld = createFakeMediaWorld();
  const counts: Partial<Record<Viewer, number>> = {};

  return {
    clock,
    /** The server process: `stop()` and `start()` it to simulate a restart. */
    server,

    /** Moves time forward; every device and the server act on the way. */
    advance(ms: number) {
      clock.advance(ms);
    },

    /** Like `advance`, letting promises settle on the way. */
    advanceAsync(ms: number) {
      return clock.advanceAsync(ms);
    },

    /** A new device of `viewer`, signed in and connecting. */
    device(viewer: Viewer, options: TestDeviceOptions = {}): TestDevice {
      counts[viewer] = (counts[viewer] ?? 0) + 1;
      const name = `${viewer}${counts[viewer]}`;
      const link: Link = { delayMs: options.delayMs ?? DEFAULT_DELAY_MS, dropped: false };
      const traffic = { name, received: [], connectionAttempts: [] };
      const deviceClock = clock.skewed(options.clockSkewMs ?? 0);
      const media = mediaWorld.platformFor(name, deviceClock);
      const device = createRealtimeDevice({
        url: "ws://watch.test/realtime",
        openSocket: server.socketsFor(viewer, link, traffic),
        clock: deviceClock,
        call: media,
      });
      device.client.start();
      return {
        ...device,
        name,
        viewer,
        clock: deviceClock,
        media,
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
