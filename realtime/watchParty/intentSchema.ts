/**
 * What the server's checks of Watch Party intents share: every intent but
 * "Watch together" is about one Watch Party, which it names.
 */
import { z } from "zod";

/** A Watch Party's id, as a device sends it. */
export const partyIdSchema = z.string().max(100);

/** An intent about one Watch Party, which is ignored once that Watch Party is gone. */
export function partyIntentSchema<T extends string>(type: T) {
  return z.object({ type: z.literal(type), partyId: partyIdSchema });
}
