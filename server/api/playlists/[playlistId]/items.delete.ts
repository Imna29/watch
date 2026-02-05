import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../database/db";
import { watchPlaylistItems } from "../../../database/watch-schema";

export default defineEventHandler(async (event) => {
  await requireAuthSession(event);
  const playlistId = getRouterParam(event, "playlistId");
  const body = await readBody(event);
  const { itemIds } = body;

  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    return { deletedCount: 0 };
  }

  await db.delete(watchPlaylistItems)
    .where(
      and(
        eq(watchPlaylistItems.playlistId, playlistId!),
        inArray(watchPlaylistItems.id, itemIds)
      )
    );

  return { deletedCount: itemIds.length };
});
