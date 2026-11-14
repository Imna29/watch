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
 * `watchParty`, `call`, ...) plus its own clock and network controls, and
 * its fake browser media for the Call (`media`: microphone, camera, peer
 * connections). Code that awaits between timers (the Call's media and peer
 * connections) needs `await h.advanceAsync(ms)`, which lets promises settle
 * on the way.
 *
 * While the
 * device takes part in a Watch Party it shows the Watch Party player, as the
 * app's layout does: real party sync driving a fake Source player
 * (`device.partySync`, `device.player`).
 *
 * Watch Party scenarios run once per Syncable Source:
 *
 * ```ts
 * describe.each(syncableSourcesUnderTest())("on %s", (source) => {
 *   const h = createHarness({ syncableSource: source });
 *   const giorgi = h.device("giorgi");
 *   const mariam = h.device("mariam", { player: { loadMs: 5 * SECOND } });
 *   ...
 *   expect(mariam.player?.position).toBeCloseTo(giorgi.player!.position, 1);
 * ```
 */
import type { Viewer } from "../../../models/Viewer";
import type { Clock } from "../../../realtime/clock";
import { createRealtimeDevice, type RealtimeDevice } from "../../../realtime/device";
import { createPartySync, type PartySync } from "../../../realtime/watchParty/partySync";
import {
  SYNCABLE_SOURCE_ADAPTERS,
  WATCH_PARTY_SOURCES,
  type AdaptedSourceId,
} from "../../../realtime/watchParty/sources";
import { createFakeClock } from "./fakeClock";
import { createFakeHistory } from "./fakeHistory";
import { createFakeMediaWorld, type FakeCallPlatform } from "./fakeMedia";
import { createFakeServer, type DeviceTraffic, type Link } from "./fakeNetwork";
import {
  createFakeFrame,
  fakePlayerSources,
  type FakeFrame,
  type FakePlayerOptions,
  type FakeSourcePlayer,
} from "./fakeSourcePlayers";

export const SECOND = 1000;

/** One-way network delay of a device unless the test says otherwise. */
const DEFAULT_DELAY_MS = 20;

export interface TestDeviceOptions {
  /** How far ahead this device's own clock is (negative: behind). */
  clockSkewMs?: number;
  /** One-way network delay, in milliseconds. */
  delayMs?: number;
  /** How the Source's player behaves on this device in a Watch Party. */
  player?: FakePlayerOptions;
}

export interface TestDevice extends RealtimeDevice, DeviceTraffic {
  readonly name: string;
  readonly viewer: Viewer;
  /** This device's own clock (skewed by `clockSkewMs`), on the harness's timeline. */
  readonly clock: Clock;
  /** Party sync, while this device shows the Watch Party player; null otherwise. */
  readonly partySync: PartySync | null;
  /** The Source's player in the Watch Party player, once it loaded something; null otherwise. */
  readonly player: FakeSourcePlayer | null;
  /** This device's fake browser media: what its microphone and camera allow, and its peer connections. */
  readonly media: FakeCallPlatform;
  /** The Viewer closes the site on this device (or the browser tab, or the browser). */
  closeSite(): void;
  /**
   * Changes this device's one-way network delay. Messages already on their
   * way keep theirs, so a shorter delay lets later messages overtake them.
   */
  setDelay(ms: number): void;
  /** This device's network silently stops carrying anything, both ways. */
  drop(): void;
  /** This device's network works again. */
  restore(): void;
}

/**
 * The Syncable Sources every Watch Party scenario runs on, once each:
 * `describe.each(syncableSourcesUnderTest())(..., (source) => createHarness({ syncableSource: source }))`.
 */
export function syncableSourcesUnderTest(): AdaptedSourceId[] {
  const faked = fakePlayerSources();
  const missing = WATCH_PARTY_SOURCES.filter((source) => !faked.includes(source));
  if (missing.length > 0) {
    throw new Error(`Add a fake player for ${missing.join(", ")} in tests/realtime/harness/fakeSourcePlayers.ts`);
  }
  return [...WATCH_PARTY_SOURCES];
}

/**
 * Whether the adapter of `source` can change the playback speed
 * (`canSetRate`; VidFast's cannot). Speed scenarios run only where it can:
 * `it.runIf(sourceCanSetRate(source))(...)`.
 */
export function sourceCanSetRate(source: AdaptedSourceId): boolean {
  const clock = createFakeClock();
  const adapter = SYNCABLE_SOURCE_ADAPTERS[source]({ frame: createFakeFrame(clock), clock });
  adapter.destroy();
  return adapter.canSetRate;
}

export interface HarnessOptions {
  /** The Syncable Source Watch Parties use. */
  syncableSource?: AdaptedSourceId;
}

export function createHarness({ syncableSource = "cinesrc" }: HarnessOptions = {}) {
  const clock = createFakeClock();
  const history = createFakeHistory();
  const server = createFakeServer(clock, {
    watchParty: { sources: [syncableSource], history },
  });
  const mediaWorld = createFakeMediaWorld();
  const counts: Partial<Record<Viewer, number>> = {};

  return {
    clock,
    /** The server process: `stop()` and `start()` it to simulate a restart. */
    server,
    /** What the server recorded in the Viewers' History and episode progress. */
    history,

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

      // The Watch Party player, shown while this device takes part (layouts/watchLayout.vue).
      let partyPlayer: { frame: FakeFrame; partySync: PartySync } | null = null;
      device.watchParty.subscribe(() => {
        if (device.watchParty.activeHere && !partyPlayer) {
          const frame = createFakeFrame(deviceClock, options.player);
          const partySync = createPartySync({
            watchParty: device.watchParty,
            client: device.client,
            clock: deviceClock,
            frame,
          });
          partyPlayer = { frame, partySync };
        } else if (!device.watchParty.activeHere && partyPlayer) {
          partyPlayer.partySync.destroy();
          partyPlayer.frame.remove();
          partyPlayer = null;
        }
      });

      return {
        ...device,
        name,
        viewer,
        clock: deviceClock,
        media,
        get partySync() {
          return partyPlayer?.partySync ?? null;
        },
        get player() {
          return partyPlayer?.frame.player ?? null;
        },
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
