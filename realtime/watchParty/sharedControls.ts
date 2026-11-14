/**
 * Shared controls, on the server: how the coordinator (`./coordinator.ts`)
 * turns a Viewer's playback change into the Watch Party's new shared state.
 * Party sync (`./partySync.ts`) sends the changes; both players then follow
 * the state.
 */
import { z } from "zod";
import type { PlaybackChange, PlaybackMessage, WatchPartyState } from "./protocol";

/** No Title runs longer than a day: a position beyond it is refused. */
const MAX_POSITION_S = 24 * 3600;

const positionSchema = z.number().finite().min(0).max(MAX_POSITION_S);

export const playbackSchema = z.object({
  type: z.literal("watchParty:playback"),
  partyId: z.string().max(100),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.enum(["play", "pause", "seek"]), position: positionSchema }),
    // The speeds a <video> plays at.
    z.object({ kind: z.literal("rate"), position: positionSchema, rate: z.number().min(0.0625).max(16) }),
  ]),
}) satisfies z.ZodType<PlaybackMessage>;

/** The phase and anchor after `change`, made at server time `now`. */
export function afterPlaybackChange(
  party: WatchPartyState,
  change: PlaybackChange,
  now: number,
): Pick<WatchPartyState, "phase" | "anchor"> {
  const anchor = { ...party.anchor, position: change.position, serverTime: now };
  switch (change.kind) {
    case "play":
      return { phase: { name: "playing" }, anchor: { ...anchor, playing: true } };
    case "pause":
      return { phase: { name: "paused" }, anchor: { ...anchor, playing: false } };
    case "seek":
      return { phase: party.phase, anchor };
    case "rate":
      return { phase: party.phase, anchor: { ...anchor, rate: change.rate } };
  }
}
