/**
 * The end of a Title in a Watch Party, on the server: how the coordinator
 * (`./coordinator.ts`) turns a player reaching the end into "Next episode in
 * 10s" for both Viewers, and when the Watch Party is over instead. Moving to
 * the next episode itself takes the same path as a Viewer choosing one
 * (`afterEpisodeChange` in `./sharedControls.ts`).
 */
import { z } from "zod";
import type { Episode, TitleEndedMessage, WatchPartyState } from "./protocol";
import { episodeSchema, positionSchema } from "./sharedControls";

/** How long both Viewers see "Next episode in 10s" before both move to it. */
export const NEXT_EPISODE_COUNTDOWN_MS = 10_000;

export const titleEndedSchema = z.object({
  type: z.literal("watchParty:ended"),
  partyId: z.string().max(100),
  episode: episodeSchema.nullable(),
  position: positionSchema,
  next: episodeSchema.nullable(),
}) satisfies z.ZodType<TitleEndedMessage>;

/**
 * The phase and anchor once an episode ended at `position`, at server time
 * `now`, with `next` after it: both players wait at the end, and both move
 * to `next` when the countdown is over.
 */
export function afterEpisodeEnded(
  party: WatchPartyState,
  position: number,
  next: Episode,
  now: number,
): Pick<WatchPartyState, "phase" | "anchor"> {
  return {
    phase: { name: "next-episode", at: now + NEXT_EPISODE_COUNTDOWN_MS, next },
    anchor: { ...party.anchor, position, serverTime: now, playing: false },
  };
}
