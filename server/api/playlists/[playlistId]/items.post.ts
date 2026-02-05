import { watchPlaylistItems } from "../../../database/watch-schema";
import { db } from "../../../database/db";

export default defineEventHandler(async (event) => {
  await requireAuthSession(event);
  const playlistId = getRouterParam(event, "playlistId");
  const body = await readBody(event);

  const { contentId, contentType } = body;

  await db.insert(watchPlaylistItems)
    .values({
      playlistId: playlistId!,
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

  return { success: true };
});
