/**
 * Keeping a Watch Party in step, on the server: the coordinator's part
 * (`./coordinator.ts` hands it the position reports). Party sync
 * (`./partySync.ts`) reports where each player is, every
 * `POSITION_REPORT_MS`, and follows what this decides.
 *
 * Each report is compared with where the shared state's anchor says the
 * player should be at the report's server time:
 * - under `DRIFT_IGNORED_S` off, nothing happens;
 * - further off, the device is told to catch up (`watchParty:catchUp`): its
 *   player moves to where the shared state is now;
 * - more than `DRIFT_LIMIT_S` behind, or stalled: every player pauses where
 *   the Watch Party is, in the "waiting" phase. The Viewer who fell behind
 *   plays on up to there, so nobody misses anything, and once every player
 *   is there, all of them start again at one moment, `RESUME_DELAY_MS` on.
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

/** A player this close to the shared state is in step; further off, it is moved. */
export const DRIFT_IGNORED_S = 0.5;

/** A player further behind than this makes everyone wait for it. */
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

/** After telling a device to catch up, give it this long before telling it again. */
const CATCH_UP_COOLDOWN_MS = 3000;

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
  /** When each active device that is not connected went away. */
  const awaySince = new Map<DeviceId, number>();
  /** What a waiting Watch Party goes back to. */
  let resumeTo: "playing" | "paused" = "playing";

  function catchUp(device: Device, current: WatchPartyState) {
    const last = caughtUpAt.get(device.id);
    if (last !== undefined && context.now() - last < CATCH_UP_COOLDOWN_MS) return;
    caughtUpAt.set(device.id, context.now());
    context.send(device.id, { type: "watchParty:catchUp", partyId: current.id, seq: current.seq });
  }

  /**
   * Pauses every player where the Watch Party was at server time `at`,
   * until `viewer`'s player is there too.
   */
  function wait(current: WatchPartyState, viewer: Viewer, reason: WaitingReason, at = context.now()) {
    if (current.phase.name === "playing" || current.phase.name === "paused") resumeTo = current.phase.name;
    publish({
      ...current,
      phase: { name: "waiting", viewer, reason },
      anchor: {
        ...current.anchor,
        position: anchorAt(current.anchor, at).position,
        serverTime: context.now(),
        playing: false,
      },
    });
  }

  /** `viewer`'s active device went away at server time `since`, and has not come back. */
  function gone(current: WatchPartyState, viewer: Viewer, since: number) {
    const { phase } = current;
    if (phase.name === "inviting" && viewer === current.starter) end("gone", viewer);
    else if (phase.name === "playing" || phase.name === "paused") wait(current, viewer, "disconnected", since);
    else if (phase.name === "waiting" && (phase.viewer !== viewer || phase.reason !== "disconnected")) {
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

  return {
    /** A position report from the active device `from` (the coordinator checks that). */
    reported(from: Device, report: PositionMessage) {
      const current = party();
      // A report about an older shared state says nothing about this one.
      if (!current || report.partyId !== current.id || report.seq !== current.seq) return;
      reports.set(from.viewer, { ...report, device: from.id });
      const phase = current.phase.name;
      if (phase === "waiting") return resumeWhenAllThere(current);
      if (phase !== "playing" && phase !== "paused") return;
      const behind = anchorAt(current.anchor, report.serverTime).position - report.position;
      if (phase === "playing" && (report.stalled || behind > DRIFT_LIMIT_S)) wait(current, from.viewer, "behind");
      else if (Math.abs(behind) > DRIFT_IGNORED_S) catchUp(from, current);
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
      if (!current) return;
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
