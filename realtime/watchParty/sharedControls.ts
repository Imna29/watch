/**
 * Shared controls, on the server: how the coordinator (`./coordinator.ts`)
 * turns a Viewer's playback change into the Watch Party's new shared state.
 * Party sync (`./partySync.ts`) sends the changes; both players then follow
 * the state.
 */
import { z } from "zod";
import type { Episode, PlaybackChange, PlaybackMessage, WatchPartyState } from "./protocol";

/** No Title runs longer than a day: a position beyond it is refused. */
const MAX_POSITION_S = 24 * 3600;

export const positionSchema = z.number().finite().min(0).max(MAX_POSITION_S);

export const episodeSchema = z.object({
  // Season 0 is "Specials" on TMDB.
  season: z.number().int().min(0).max(10_000),
  episode: z.number().int().min(0).max(100_000),
});

export const playbackSchema = z.object({
  type: z.literal("watchParty:playback"),
  partyId: z.string().max(100),
  change: z.discriminatedUnion("kind", [
    z.object({ kind: z.enum(["play", "pause", "seek"]), position: positionSchema }),
    // The speeds a <video> plays at.
    z.object({ kind: z.literal("rate"), position: positionSchema, rate: z.number().min(0.0625).max(16) }),
  ]),
}) satisfies z.ZodType<PlaybackMessage>;

/** Whether `a` and `b` are the same episode, or both null (a movie). */
export function sameEpisode(a: Episode | null, b: Episode | null) {
  return a === b || (!!a && !!b && a.season === b.season && a.episode === b.episode);
}

/**
 * The Watch Party after a Viewer chose `episode` at server time `now`: both
 * players load it, and once both have, the 3-2-1 starts it from the
 * beginning, as it started the first one. At the same speed.
 */
export function afterEpisodeChange(
  party: WatchPartyState,
  episode: Episode,
  now: number,
): Pick<WatchPartyState, "episode" | "phase" | "anchor"> {
  return {
    episode,
    phase: { name: "countdown", endsAt: null },
    anchor: { ...party.anchor, position: 0, serverTime: now, playing: false },
  };
}

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
