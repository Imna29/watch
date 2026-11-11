import { and, eq } from "drizzle-orm";
import { db } from "../database/db";
import { watchPlaylists } from "../database/watch-schema";

/**
 * Returns the playlist only if it belongs to `userId`.
 * Responds 404 (not 403) for someone else's playlist so that playlist ids
 * cannot be probed for existence.
 */
export async function requireOwnedPlaylist(playlistId: string, userId: string) {
  const [playlist] = await db.select()
    .from(watchPlaylists)
    .where(
      and(
        eq(watchPlaylists.id, playlistId),
        eq(watchPlaylists.userId, userId)
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
