import { eq, desc } from "drizzle-orm";
import { db } from "../../../database/db";
import { watchPlaylistItems } from "../../../database/watch-schema";

export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { playlistId } = await getValidatedRouterParams(event, playlistParamsSchema.parse);
  const playlist = await requireOwnedPlaylist(playlistId, viewer);

  const items = await db.select()
    .from(watchPlaylistItems)
    .where(eq(watchPlaylistItems.playlistId, playlistId))
    .orderBy(desc(watchPlaylistItems.watchedAt));

  return {
    ...playlist,
    items,
  };
});
