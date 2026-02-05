import { eq, desc } from "drizzle-orm";
import { db } from "../../../database/db";
import { watchPlaylists, watchPlaylistItems } from "../../../database/watch-schema";

export default defineEventHandler(async (event) => {
  await requireAuthSession(event);
  const playlistId = getRouterParam(event, "playlistId");

  const [playlist] = await db.select()
    .from(watchPlaylists)
    .where(eq(watchPlaylists.id, playlistId!));

  if (!playlist) {
    throw createError({
      statusCode: 404,
      statusMessage: "Playlist not found",
    });
  }

  const items = await db.select()
    .from(watchPlaylistItems)
    .where(eq(watchPlaylistItems.playlistId, playlistId!))
    .orderBy(desc(watchPlaylistItems.watchedAt));

  return {
    ...playlist,
    items,
  };
});
