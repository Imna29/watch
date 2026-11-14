import { and, eq } from "drizzle-orm";
import { db } from "../database/db";
import { watchPlaylistItems, watchPlaylists } from "../database/watch-schema";
import type { Viewer } from "~/models/Viewer";
import type { WatchPlaylistItemType, WatchPlaylistType } from "~/models/apiModels/watch/Playlist";

/** The Viewer's one playlist of a built-in type (History, Watch Later, Favorites), if it exists. */
export async function findSystemPlaylist(viewer: Viewer, type: Exclude<WatchPlaylistType, "CUSTOM">) {
  const [playlist] = await db.select()
    .from(watchPlaylists)
    .where(and(eq(watchPlaylists.viewer, viewer), eq(watchPlaylists.type, type)))
    .limit(1);
  return playlist;
}

/** Adds a Title to a playlist; a Title already in it moves to the top (watched now). */
export async function addPlaylistItem(
  playlistId: string,
  contentType: `${WatchPlaylistItemType}`,
  contentId: number,
) {
  await db.insert(watchPlaylistItems)
    .values({
      playlistId,
      contentType,
      contentId,
      watchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [watchPlaylistItems.playlistId, watchPlaylistItems.contentType, watchPlaylistItems.contentId],
      set: {
        watchedAt: new Date(),
      },
    });
}

/**
 * Returns the playlist only if it belongs to `viewer`.
 * Responds 404 (not 403) for the other Viewer's playlist so that playlist ids
 * cannot be probed for existence.
 */
export async function requireOwnedPlaylist(playlistId: string, viewer: Viewer) {
  const [playlist] = await db.select()
    .from(watchPlaylists)
    .where(
      and(
        eq(watchPlaylists.id, playlistId),
        eq(watchPlaylists.viewer, viewer)
      )
    );

  if (!playlist) {
    throw createError({
      statusCode: 404,
      statusMessage: "Playlist not found",
    });
  }

  return playlist;
}
