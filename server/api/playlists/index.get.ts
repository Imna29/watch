import { eq } from "drizzle-orm";
import { db } from "../../database/db";
import { watchPlaylists } from "../../database/watch-schema";

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);
  
  return await db.select()
    .from(watchPlaylists)
    .where(eq(watchPlaylists.userId, session.user.id));
});
