import type { Viewer } from "../../../models/Viewer";
import type { HistoryEntry, HistoryPort } from "../../../realtime/watchParty/coordinator";

/** The History port, keeping what was recorded in memory. Like the database, it outlives server restarts. */
export interface FakeHistory extends HistoryPort {
  /** Everything recorded, in order. */
  readonly recorded: ({ viewer: Viewer } & HistoryEntry)[];
}

export function createFakeHistory(): FakeHistory {
  const recorded: FakeHistory["recorded"] = [];
  return {
    recorded,
    record(viewer, { title, episode }) {
      recorded.push({ viewer, title, episode });
    },
  };
}
