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
 * other Viewer to join stays while the starter has any device on the site,
 * so the other Viewer can join whenever they come, and ends ("gone") once
 * the starter has had none for `INVITE_GRACE_MS`.
 */
import { z } from "zod";
import { VIEWERS, type Viewer } from "../../models/Viewer";
import type { CoordinatorContext, Device } from "../coordinator";
import type { DeviceId } from "../protocol";
import { anchorAt, type PositionMessage, type WatchPartyEndReason, type WatchPartyState } from "./protocol";
import { partyIntentSchema } from "./intentSchema";
import { noTabShare } from "./tabShare";

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

/** How long a Watch Party waiting for the other Viewer to join outlasts its starter having no device on the site. */
export const INVITE_GRACE_MS = 2 * 60_000;

/**
 * How long a Tab Share outlasts its sharer's active device being gone,
 * leaving the other Viewer a still picture. Longer than a network drop the
 * device comes back from: the server notices a silent device after 6 s
 * (`SILENCE_LIMIT_MS`), and a device retries at most every 10 s.
 */
export const TAB_SHARE_GONE_MS = DISCONNECT_GRACE_MS + 25_000;

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

export const positionSchema = partyIntentSchema("watchParty:position").extend({
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
  /** Since when the starter of the Watch Party `partyId`, still inviting, has had no device on the site. */
  let starterAway: { partyId: string; since: number } | null = null;
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
    const { phase } = current;
    // A Watch Party that was about to start starts once everyone is there.
    if (phase.name === "playing" || phase.name === "paused") resumeTo = phase.name;
    else if (phase.name === "countdown") resumeTo = "playing";
    publish({
      ...current,
      phase: { name: "waiting", viewer, reason },
      anchor: { ...current.anchor, position, serverTime: context.now(), playing: false },
    });
  }

  /** Ends the invite once its starter has had no device on the site for `INVITE_GRACE_MS`. */
  function keepInviteWhileStarterIsOn(current: WatchPartyState) {
    const { starter } = current;
    if (context.devices().some((device) => device.viewer === starter)) {
      starterAway = null;
      return;
    }
    if (starterAway?.partyId !== current.id) starterAway = { partyId: current.id, since: context.now() };
    if (context.now() - starterAway.since >= INVITE_GRACE_MS) end("gone", starter);
  }

  /** `viewer`'s active device went away at server time `since`, and has not come back. */
  function gone(current: WatchPartyState, viewer: Viewer, since: number) {
    const { phase } = current;
    if (phase.name === "playing" || phase.name === "paused" || phase.name === "countdown") {
      // From where the Watch Party was when they went: they miss nothing while they are gone. Before
      // the Title started (a player still loading), it no longer gets ready without them: it waits.
      wait(current, viewer, "disconnected", anchorAt(current.anchor, since).position);
    } else if (phase.name === "waiting" && (phase.viewer !== viewer || phase.reason !== "disconnected")) {
      publish({ ...current, phase: { name: "waiting", viewer, reason: "disconnected" } });
    }
  }

  /**
   * `sharer`'s device, which shared its tab, has been gone for
   * `TAB_SHARE_GONE_MS`: the Tab Share stops, and both wait for them on the
   * Syncable Source, still paused where the Tab Share left it.
   */
  function sharerGone(current: WatchPartyState, sharer: Viewer) {
    resumeTo = "paused";
    publish({
      ...current,
      ...noTabShare(),
      phase: { name: "waiting", viewer: sharer, reason: "disconnected" },
      lastChangeBy: sharer,
      // The seq `publish` gives this state.
      lastChange: { kind: "sharer-gone", by: sharer, seq: current.seq + 1 },
    });
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
      /** Since when `viewer`'s active device has been gone; null while it is connected. */
      const awayFrom = (viewer: Viewer) => {
        const device = current?.activeDevices[viewer] ?? null;
        if (device === null || connected.has(device)) return null;
        const since = awaySince.get(device) ?? context.now();
        awaySince.set(device, since);
        return since;
      };
      if (!current) return;
      // A Tab Share stands still anyway, with no Syncable Source player to wait for (`./tabShare.ts`),
      // until nobody could show the tab any more.
      if (current.mode === "tab-share") {
        const sharer = current.tabShare?.sharer;
        const since = sharer ? awayFrom(sharer) : null;
        if (sharer && since !== null && context.now() - since >= TAB_SHARE_GONE_MS) sharerGone(current, sharer);
        return;
      }
      if (current.phase.name === "inviting") return keepInviteWhileStarterIsOn(current);
      starterAway = null;
      for (const viewer of VIEWERS) {
        const since = awayFrom(viewer);
        if (since !== null && context.now() - since >= DISCONNECT_GRACE_MS) return gone(current, viewer, since);
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
