import { watchPlaylistItems } from "../../../database/watch-schema";
import { db } from "../../../database/db";

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const { playlistId } = await getValidatedRouterParams(event, playlistParamsSchema.parse);
  const { contentId, contentType } = await readValidatedBody(event, addPlaylistItemBodySchema.parse);
  await requireOwnedPlaylist(playlistId, session.user.id);

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

  return { success: true };
});
