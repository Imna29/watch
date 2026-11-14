/**
 * Every Syncable Source adapter, by Source. A Watch Party only uses a
 * Syncable Source that has one, and the seam 1 tests run every scenario once
 * per adapter listed here (`tests/realtime/harness/fakeSourcePlayers.ts`).
 */
import { SOURCES, type SourceId } from "../../../utils/sources";
import type { AdapterFactory } from "./adapter";
import { createCineSrcAdapter } from "./cinesrc";
import { createVidFastAdapter } from "./vidfast";

export const SYNCABLE_SOURCE_ADAPTERS = {
  cinesrc: createCineSrcAdapter,
  vidfast: createVidFastAdapter,
} satisfies Partial<Record<SourceId, AdapterFactory>>;

export type AdaptedSourceId = keyof typeof SYNCABLE_SOURCE_ADAPTERS;

export function hasAdapter(id: SourceId): id is AdaptedSourceId {
  return id in SYNCABLE_SOURCE_ADAPTERS;
}

/** The Syncable Sources a Watch Party uses, best first: the Source catalog's order. */
export const WATCH_PARTY_SOURCES: readonly AdaptedSourceId[] = SOURCES.flatMap((source) =>
  source.syncable && hasAdapter(source.id) ? [source.id] : [],
);
