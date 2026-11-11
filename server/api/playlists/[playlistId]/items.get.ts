import { eq, desc } from "drizzle-orm";
import { db } from "../../../database/db";
import { watchPlaylistItems } from "../../../database/watch-schema";

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const { playlistId } = await getValidatedRouterParams(event, playlistParamsSchema.parse);
  const playlist = await requireOwnedPlaylist(playlistId, session.user.id);

  const items = await db.select()
    .from(watchPlaylistItems)
    .where(eq(watchPlaylistItems.playlistId, playlistId))
    .orderBy(desc(watchPlaylistItems.watchedAt));

  return {
    ...playlist,
    items,
  };
});
