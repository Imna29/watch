import { and, eq } from "drizzle-orm";
import { db } from "../database/db";
import { watchPlaylists } from "../database/watch-schema";
import type { Viewer } from "~/models/Viewer";

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
