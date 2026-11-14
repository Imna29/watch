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
 *   player moves to where the shared state is now.
 */
import { z } from "zod";
import type { CoordinatorContext, Device } from "../coordinator";
import type { DeviceId } from "../protocol";
import { anchorAt, type PositionMessage, type WatchPartyState } from "./protocol";

/** How often party sync reports where its player is. */
export const POSITION_REPORT_MS = 1000;

/** A player this close to the shared state is in step; further off, it is moved. */
export const DRIFT_IGNORED_S = 0.5;

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
  blocked: z.boolean(),
}) satisfies z.ZodType<PositionMessage>;

export interface DriftOptions {
  context: CoordinatorContext;
  /** The Watch Party now; null when there is none. */
  party(): WatchPartyState | null;
}

export function keepInStep({ context, party }: DriftOptions) {
  /** When each device was last told to catch up. */
  const caughtUpAt = new Map<DeviceId, number>();

  function catchUp(device: Device, current: WatchPartyState) {
    const last = caughtUpAt.get(device.id);
    if (last !== undefined && context.now() - last < CATCH_UP_COOLDOWN_MS) return;
    caughtUpAt.set(device.id, context.now());
    context.send(device.id, { type: "watchParty:catchUp", partyId: current.id, seq: current.seq });
  }

  return {
    /** A position report from the active device `from` (the coordinator checks that). */
    reported(from: Device, report: PositionMessage) {
      const current = party();
      // A report about an older shared state says nothing about this one.
      if (!current || report.partyId !== current.id || report.seq !== current.seq) return;
      if (current.phase.name !== "playing" && current.phase.name !== "paused") return;
      const expected = anchorAt(current.anchor, report.serverTime).position;
      if (Math.abs(expected - report.position) > DRIFT_IGNORED_S) catchUp(from, current);
    },
  };
}
