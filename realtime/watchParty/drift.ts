/**
 * Keeping a Watch Party in step, on the server: the coordinator's part
 * (`./coordinator.ts` hands it the position reports). Party sync
 * (`./partySync.ts`) reports where each player is, every
 * `POSITION_REPORT_MS`, and follows what this decides.
 *
 * Drift is the spread between the two players, by their latest reports on
 * the server's clock (each one as far ahead of the shared state's anchor as
 * it was at its report's time). Nobody is ever rewound to correct it:
 * - under `DRIFT_IGNORED_S` apart, nothing happens;
 * - up to `DRIFT_LIMIT_S` apart, the player behind moves forward to the one
 *   ahead: it is told to catch up (`watchParty:catchUp`) to where the shared
 *   state is now. When the player ahead is off the shared state, the shared
 *   state moves to it instead (re-anchored), and the player behind follows;
 * - further apart, or stalled, or when catching up keeps failing: every
 *   player pauses where the one furthest ahead is, in the "waiting" phase.
 *   The Viewer who fell behind plays on up to there, so nobody misses
 *   anything, and once every player is there, all of them start again at
 *   one moment, `RESUME_DELAY_MS` on.
 *
 * A Viewer whose active device has been disconnected for
 * `DISCONNECT_GRACE_MS` is waited for the same way, from where the Watch
 * Party was when the device went away. A Watch Party still waiting for the
 * other Viewer to join ends instead when the starter's device is gone.
 */
import { z } from "zod";
import { VIEWERS, type Viewer } from "../../models/Viewer";
import type { CoordinatorContext, Device } from "../coordinator";
import type { DeviceId } from "../protocol";
import { anchorAt, type PositionMessage, type WatchPartyEndReason, type WatchPartyState } from "./protocol";

/** How often party sync reports where its player is. */
export const POSITION_REPORT_MS = 1000;

/** Players this close together are in step; further apart, the one behind is moved forward. */
export const DRIFT_IGNORED_S = 0.5;

/** Players further apart than this make everyone wait for the one behind. */
export const DRIFT_LIMIT_S = 2;

/**
 * How far ahead of the moment a waiting Watch Party resumes the players
 * start, so the news reaches every device first and they all start together.
 */
export const RESUME_DELAY_MS = 1000;

/**
 * How long the active device of a Viewer may be disconnected before the
 * Watch Party waits for them: long enough for a page reload or a quick
 * reconnect to go unnoticed.
 */
export const DISCONNECT_GRACE_MS = 5000;

/**
 * After telling a device to catch up, its reports from before it could have
 * done so (sent before the message reached it) are ignored for this long.
 * It sends none while its player seeks.
 */
const CATCH_UP_SETTLE_MS = POSITION_REPORT_MS;

/** A Viewer whose player needed this many catch-ups within `CATCH_UP_WINDOW_MS` is waited for instead. */
const MAX_CATCH_UPS = 3;
const CATCH_UP_WINDOW_MS = 30_000;

/** A report older than this no longer says where its player is. */
const REPORT_FRESH_MS = 3 * POSITION_REPORT_MS;

/** No Title runs longer than a day. */
const MAX_POSITION_S = 24 * 3600;

export const positionSchema = z.object({
  type: z.literal("watchParty:position"),
  partyId: z.string().max(100),
  seq: z.number().int().min(0),
  position: z.number().finite().min(0).max(MAX_POSITION_S),
  serverTime: z.number().finite(),
  stalled: z.boolean(),
}) satisfies z.ZodType<PositionMessage>;

export interface DriftOptions {
  context: CoordinatorContext;
  /** The Watch Party now; null when there is none. */
  party(): WatchPartyState | null;
  /** Tells every device the Watch Party's new shared state. */
  publish(next: Omit<WatchPartyState, "seq">): void;
  /** Ends the Watch Party for both Viewers. */
  end(reason: WatchPartyEndReason, by: Viewer): void;
}

export function keepInStep({ context, party, publish, end }: DriftOptions) {
  /** Each Viewer's latest report, with the device it came from. */
  const reports = new Map<Viewer, PositionMessage & { device: DeviceId }>();
  /** When each device was last told to catch up. */
  const caughtUpAt = new Map<DeviceId, number>();
  /** When each Viewer's player was lately moved forward to catch up (see `MAX_CATCH_UPS`). */
  const catchUps = new Map<Viewer, number[]>();
  /** When each active device that is not connected went away. */
  const awaySince = new Map<DeviceId, number>();
  /** What a waiting Watch Party goes back to. */
  let resumeTo: "playing" | "paused" = "playing";

  /** `viewer`'s latest report, while it still says where their active device's player is. */
  function reportOf(viewer: Viewer, current: WatchPartyState) {
    const report = reports.get(viewer);
    if (!report || report.device !== current.activeDevices[viewer] || report.seq !== current.seq) return null;
    return context.now() - report.serverTime <= REPORT_FRESH_MS ? report : null;
  }

  /** How far ahead of the shared state `report`'s player was (negative: behind), at the report's time. */
  function offsetOf(report: PositionMessage, current: WatchPartyState) {
    return report.position - anchorAt(current.anchor, report.serverTime).position;
  }

  /**
   * Where `viewer`'s player is now, by their latest report (a stalled player
   * stands still); where the shared state is, when they have none.
   */
  function positionNow(viewer: Viewer, current: WatchPartyState) {
    const report = reportOf(viewer, current);
    if (report?.stalled) return report.position;
    const shared = anchorAt(current.anchor, context.now()).position;
    return report ? shared + offsetOf(report, current) : shared;
  }

  /** Where the player furthest ahead is now: where a Watch Party that waits for the others waits, so nobody is rewound. */
  function furthestAhead(current: WatchPartyState) {
    return Math.max(...VIEWERS.map((viewer) => positionNow(viewer, current)));
  }

  /** Whether `viewer`'s player needed so many catch-ups lately that catching up does not work for it. */
  function catchingUpFails(viewer: Viewer) {
    const recent = (catchUps.get(viewer) ?? []).filter((at) => context.now() - at < CATCH_UP_WINDOW_MS);
    catchUps.set(viewer, recent);
    return recent.length >= MAX_CATCH_UPS;
  }

  /**
   * Moves `viewer`'s player forward to the other player, which is
   * `leaderOffset` seconds off the shared state (negative: behind it).
   */
  function catchUp(current: WatchPartyState, viewer: Viewer, leaderOffset: number) {
    catchUps.set(viewer, [...(catchUps.get(viewer) ?? []), context.now()]);
    if (Math.abs(leaderOffset) > DRIFT_IGNORED_S) {
      // The shared state moves to the player ahead; the one behind follows it there.
      const position = anchorAt(current.anchor, context.now()).position + leaderOffset;
      publish({ ...current, anchor: { ...current.anchor, position, serverTime: context.now() } });
      return;
    }
    const device = current.activeDevices[viewer]!;
    caughtUpAt.set(device, context.now());
    reports.delete(viewer);
    context.send(device, { type: "watchParty:catchUp", partyId: current.id, seq: current.seq });
  }

  /** Pauses every player at `position`, until `viewer`'s player is there too. */
  function wait(current: WatchPartyState, viewer: Viewer, reason: WaitingReason, position: number) {
    if (current.phase.name === "playing" || current.phase.name === "paused") resumeTo = current.phase.name;
    publish({
      ...current,
      phase: { name: "waiting", viewer, reason },
      anchor: { ...current.anchor, position, serverTime: context.now(), playing: false },
    });
  }

  /** `viewer`'s active device went away at server time `since`, and has not come back. */
  function gone(current: WatchPartyState, viewer: Viewer, since: number) {
    const { phase } = current;
    if (phase.name === "inviting" && viewer === current.starter) end("gone", viewer);
    else if (phase.name === "playing" || phase.name === "paused") {
      // From where the Watch Party was when they went: they miss nothing while they are gone.
      wait(current, viewer, "disconnected", anchorAt(current.anchor, since).position);
    } else if (phase.name === "waiting" && (phase.viewer !== viewer || phase.reason !== "disconnected")) {
      publish({ ...current, phase: { name: "waiting", viewer, reason: "disconnected" } });
    }
  }

  /** Whether `viewer`'s player, as last reported, is where the waiting Watch Party is. */
  function isThere(viewer: Viewer, current: WatchPartyState) {
    const report = reports.get(viewer);
    return (
      !!report &&
      report.device === current.activeDevices[viewer] &&
      report.seq === current.seq &&
      !report.stalled &&
      Math.abs(report.position - current.anchor.position) <= DRIFT_IGNORED_S
    );
  }

  /** Starts every player again, together, once all of them are where the Watch Party waits. */
  function resumeWhenAllThere(current: WatchPartyState) {
    if (!VIEWERS.every((viewer) => isThere(viewer, current))) return;
    publish({
      ...current,
      phase: { name: resumeTo },
      anchor: { ...current.anchor, serverTime: context.now() + RESUME_DELAY_MS, playing: resumeTo === "playing" },
    });
  }

  /** Keeps the players of a playing Watch Party together, after `viewer` reported. */
  function keepTogether(current: WatchPartyState, viewer: Viewer) {
    if (reportOf(viewer, current)?.stalled) return wait(current, viewer, "behind", furthestAhead(current));
    const offsets: PlayerOffset[] = [];
    for (const each of VIEWERS) {
      const report = reportOf(each, current);
      // Both players must say where they are, and neither may stand still.
      if (!report || report.stalled) return;
      offsets.push({ viewer: each, offset: offsetOf(report, current) });
    }
    const [behind, ahead] = offsets.sort((a, b) => a.offset - b.offset) as [PlayerOffset, PlayerOffset];
    const spread = ahead.offset - behind.offset;
    if (spread <= DRIFT_IGNORED_S) return;
    if (spread > DRIFT_LIMIT_S || catchingUpFails(behind.viewer)) {
      return wait(current, behind.viewer, "behind", furthestAhead(current));
    }
    catchUp(current, behind.viewer, ahead.offset);
  }

  return {
    /** A position report from the active device `from` (the coordinator checks that). */
    reported(from: Device, report: PositionMessage) {
      const current = party();
      // A report about an older shared state says nothing about this one,
      if (!current || report.partyId !== current.id || report.seq !== current.seq) return;
      // nor does one sent before the device could carry out the catch-up it was told.
      const toldAt = caughtUpAt.get(from.id);
      if (toldAt !== undefined && report.serverTime < toldAt + CATCH_UP_SETTLE_MS) return;
      reports.set(from.viewer, { ...report, device: from.id });
      const phase = current.phase.name;
      if (phase === "waiting") return resumeWhenAllThere(current);
      if (phase === "playing") return keepTogether(current, from.viewer);
    },

    /**
     * How the Watch Party changes when `viewer`'s Device comes back on a new
     * connection: no longer gone, but it has yet to catch up.
     */
    rejoined(current: WatchPartyState, viewer: Viewer): Partial<WatchPartyState> {
      const { phase } = current;
      if (phase.name !== "waiting" || phase.viewer !== viewer || phase.reason !== "disconnected") return {};
      return { phase: { ...phase, reason: "behind" } };
    },

    /** A device's connection closed: when it is an active device, it is gone from now. */
    disconnected(device: Device) {
      if (party()?.activeDevices[device.viewer] === device.id) awaySince.set(device.id, context.now());
    },

    /** Called on every clock tick: waits for a Viewer whose active device has been gone too long. */
    tick() {
      const current = party();
      const connected = new Set(context.devices().map((device) => device.id));
      const active = new Set(current ? Object.values(current.activeDevices) : []);
      for (const device of awaySince.keys()) {
        if (!active.has(device) || connected.has(device)) awaySince.delete(device);
      }
      for (const device of caughtUpAt.keys()) {
        if (!connected.has(device)) caughtUpAt.delete(device);
      }
      // A Tab Share stands still anyway, with no Syncable Source player to wait for (`./tabShare.ts`).
      if (!current || current.mode === "tab-share") return;
      for (const viewer of VIEWERS) {
        const device = current.activeDevices[viewer];
        if (device === null || connected.has(device)) continue;
        const since = awaySince.get(device) ?? context.now();
        awaySince.set(device, since);
        if (context.now() - since >= DISCONNECT_GRACE_MS) return gone(current, viewer, since);
      }
    },
  };
}

type WaitingReason = Extract<WatchPartyState["phase"], { name: "waiting" }>["reason"];

interface PlayerOffset {
  viewer: Viewer;
  /** How far ahead of the shared state the Viewer's player is (negative: behind it). */
  offset: number;
}
