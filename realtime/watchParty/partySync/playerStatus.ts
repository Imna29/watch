/**
 * The device side of Source fallback (`../sourceFallback.ts` on the server):
 * party sync tells the coordinator that its player loaded the Watch Party's
 * Title, or that the Source could not play it, which offers both Viewers
 * the next Syncable Source.
 */
import type { SourceId } from "../../../utils/sources";
import type { DeviceClient } from "../../deviceClient";
import type { DeviceWatchParty } from "../device";
import type { Episode, WatchPartyState } from "../protocol";

export function createPlayerStatus({ client, watchParty }: { client: DeviceClient; watchParty: DeviceWatchParty }) {
  /** What this device last told the coordinator, and on which connection. */
  let reported: { partyId: string; status: "ready" | "failed"; on: string | null } | null = null;

  return {
    /** The player loads something anew: its status is news again. */
    reset() {
      reported = null;
    },

    /**
     * Tells the coordinator `status` about `source` playing `episode` (null:
     * a movie) in `party`: once per Watch Party, and again on a new
     * connection, since the coordinator knows players by connection.
     */
    report(party: WatchPartyState, status: "ready" | "failed", source: SourceId, episode: Episode | null) {
      const on = client.identity?.deviceId ?? null;
      if (reported?.partyId === party.id && reported.status === status && reported.on === on) return;
      reported = { partyId: party.id, status, on };
      if (status === "ready") watchParty.playerReady(party.id, episode, source);
      else watchParty.playerFailed(party.id, episode, source);
    },
  };
}
