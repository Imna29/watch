import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../database/db";
import { watchPlaylistItems } from "../../../database/watch-schema";

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const { playlistId } = await getValidatedRouterParams(event, playlistParamsSchema.parse);
  const { itemIds } = await readValidatedBody(event, deletePlaylistItemsBodySchema.parse);
  await requireOwnedPlaylist(playlistId, session.user.id);

  if (itemIds.length === 0) {
    return { deletedCount: 0 };
  }

  const deleted = await db.delete(watchPlaylistItems)
    .where(
      and(
        eq(watchPlaylistItems.playlistId, playlistId),
        inArray(watchPlaylistItems.id, itemIds)
      )
    )
    .returning({ id: watchPlaylistItems.id });

  return { deletedCount: deleted.length };
});
