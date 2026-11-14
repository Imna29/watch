import { eq } from "drizzle-orm";
import { db } from "../../database/db";
import { watchPlaylists } from "../../database/watch-schema";

export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);

  return await db.select()
    .from(watchPlaylists)
    .where(eq(watchPlaylists.viewer, viewer));
});
