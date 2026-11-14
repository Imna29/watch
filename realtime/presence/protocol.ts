import type { Viewer } from "../../models/Viewer";
import type { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";

/** A Title, with the name to show for it. */
export interface TitleRef {
  contentType: WatchPlaylistItemType;
  tmdbId: number;
  name: string;
}

export interface ViewerPresence {
  /** Whether any of the Viewer's devices is connected. */
  online: boolean;
  /** The Title open in a player on one of the Viewer's devices, if any. */
  watching: TitleRef | null;
}

/** A device tells the server which Title its player shows (null: no player open). */
export interface WatchingMessage {
  type: "presence:watching";
  title: TitleRef | null;
}

/** Sent to every device whenever any Viewer's presence changes, and to each device as it connects. */
export interface PresenceMessage {
  type: "presence";
  viewers: Record<Viewer, ViewerPresence>;
}

export type PresenceDeviceMessage = WatchingMessage;
export type PresenceServerMessage = PresenceMessage;
