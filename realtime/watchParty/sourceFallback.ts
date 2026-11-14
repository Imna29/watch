/**
 * Source fallback and switching, on the server: how the coordinator
 * (`./coordinator.ts`) keeps a Watch Party on a Syncable Source that works.
 * When the Source cannot play the Title on a Viewer's device, both Viewers
 * are offered the next Syncable Source, and once none is left, Tab Share.
 * Either Viewer can switch Source (taking the offer, or at any time), which
 * moves both players there at the current position.
 */
import { z } from "zod";
import { SOURCES, type SourceId } from "../../utils/sources";
import { anchorAt } from "./partySync";
import type { SourceFallback, SwitchSourceMessage, WatchPartyState } from "./protocol";

/** A Source of the Source catalog, sent by a device. */
export const sourceIdSchema = z.custom<SourceId>(
  (value) => typeof value === "string" && SOURCES.some((source) => source.id === value),
);

export const switchSourceSchema = z.object({
  type: z.literal("watchParty:source"),
  partyId: z.string().max(100),
  source: sourceIdSchema,
}) satisfies z.ZodType<SwitchSourceMessage>;

/** A new Watch Party (or a new episode of it): no Source has failed it yet. */
export const NO_FAILED_SOURCES: Pick<WatchPartyState, "failedSources" | "fallback"> = {
  failedSources: [],
  fallback: null,
};

/**
 * The Watch Party after its Source could not play the Title on a Viewer's
 * device, with `sources` the Syncable Sources it may use, best first. Null
 * when it already knew.
 */
export function afterSourceFailed(
  party: WatchPartyState,
  sources: readonly SourceId[],
): Pick<WatchPartyState, "failedSources" | "fallback"> | null {
  if (party.failedSources.includes(party.source)) return null;
  const failedSources = [...party.failedSources, party.source];
  return { failedSources, fallback: fallbackAfter(failedSources, sources) };
}

/** The best Syncable Source that has not failed yet; Tab Share once every one has. */
function fallbackAfter(failedSources: readonly SourceId[], sources: readonly SourceId[]): SourceFallback {
  const next = sources.find((source) => !failedSources.includes(source));
  return next ? { kind: "source", source: next } : { kind: "tab-share" };
}

/**
 * The Watch Party after a Viewer switched it to `source` at server time
 * `now`. Both players load it where the Title is now. A Watch Party that was
 * playing (or about to) then waits for both and starts again with a 3-2-1,
 * as at the start; a paused one stays paused, and one still waiting for the
 * other Viewer goes on waiting.
 */
export function afterSourceSwitch(
  party: WatchPartyState,
  source: SourceId,
  now: number,
): Pick<WatchPartyState, "source" | "fallback" | "phase" | "anchor"> {
  const resumes = party.phase.name === "playing" || party.phase.name === "countdown";
  return {
    source,
    fallback: null,
    phase: resumes ? { name: "countdown", endsAt: null } : party.phase,
    anchor: { ...party.anchor, position: anchorAt(party.anchor, now).position, serverTime: now, playing: false },
  };
}
