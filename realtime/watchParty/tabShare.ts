/**
 * Tab Share, on the server: how the coordinator (`./coordinator.ts`) holds
 * the Watch Party while one Viewer plays any Source and shares that browser
 * tab over the Call, and the other watches it there. It is offered once no
 * Syncable Source has the Title (Source fallback), and either Viewer can
 * start it at any time.
 *
 * The site can neither see nor control the sharer's player, so meanwhile
 * the Watch Party stands still where it was, paused, and ignores everything
 * about Syncable Source players (`exceptInTabShare`): there are none. When
 * either Viewer stops it, both go back to the Syncable Source, still paused
 * there. Another episode stops it too: every Syncable Source gets another
 * chance at it.
 *
 * The device side, which shares the tab over the Call, is
 * `./tabShareDevice.ts`.
 */
import { z } from "zod";
import { partyIntentSchema } from "./intentSchema";
import type { Viewer } from "../../models/Viewer";
import type { MessageHandler, MessageHandlers } from "../coordinator";
import type { DeviceMessageType } from "../protocol";
import { anchorAt } from "./partySync";
import type { StopTabShareMessage, TabShare, TabShareMessage, WatchPartyState } from "./protocol";
import { sourceIdSchema } from "./sourceFallback";

export const tabShareSchema = partyIntentSchema("watchParty:tabShare").extend({
  source: sourceIdSchema,
  sound: z.boolean(),
}) satisfies z.ZodType<TabShareMessage>;

export const stopTabShareSchema = partyIntentSchema(
  "watchParty:stopTabShare",
) satisfies z.ZodType<StopTabShareMessage>;

/** Not in Tab Share: both Viewers watch in a Syncable Source's player. */
export function noTabShare(): Pick<WatchPartyState, "mode" | "tabShare"> {
  return { mode: "syncable-source", tabShare: null };
}

/**
 * Whether `viewer` may share their tab now: both Viewers are in and the
 * Title is (about to be) under way, and nobody else shares theirs. The
 * sharer may send it again, playing another Source.
 */
export function canShareTab(party: WatchPartyState, viewer: Viewer): boolean {
  const phase = party.phase.name;
  if (phase !== "countdown" && phase !== "playing" && phase !== "paused") return false;
  return party.tabShare === null || party.tabShare.sharer === viewer;
}

/** The Watch Party once `tabShare` began (or changed Source) at server time `now`: it stands still, paused. */
export function afterTabShareStarted(
  party: WatchPartyState,
  tabShare: TabShare,
  now: number,
): Pick<WatchPartyState, "mode" | "tabShare" | "phase" | "anchor"> {
  return {
    mode: "tab-share",
    tabShare,
    phase: { name: "paused" },
    anchor: { ...party.anchor, position: anchorAt(party.anchor, now).position, serverTime: now, playing: false },
  };
}

/**
 * The intents about a Syncable Source's player: its status, playback in it,
 * where it is, its end, and switching it. In Tab Share there is no such
 * player, so they are ignored.
 */
const ABOUT_THE_SYNCABLE_PLAYER: ReadonlySet<DeviceMessageType> = new Set([
  "watchParty:player",
  "watchParty:playback",
  "watchParty:position",
  "watchParty:ended",
  "watchParty:source",
]);

/** `handlers`, minus every intent about a Syncable Source's player while `current()` is in Tab Share. */
export function exceptInTabShare(current: () => WatchPartyState | null, handlers: MessageHandlers): MessageHandlers {
  const guarded: Record<string, MessageHandler<DeviceMessageType>> = {};
  for (const [type, handler] of Object.entries(handlers) as [DeviceMessageType, MessageHandler<DeviceMessageType>][]) {
    guarded[type] = !ABOUT_THE_SYNCABLE_PLAYER.has(type)
      ? handler
      : {
          schema: handler.schema,
          handle(from, message) {
            if (current()?.mode !== "tab-share") handler.handle(from, message);
          },
        };
  }
  return guarded as MessageHandlers;
}
