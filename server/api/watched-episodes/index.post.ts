import { watchedEpisodes } from "../../database/watch-schema";
import { db } from "../../database/db";

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const body = await readBody(event);
  const { tvId, seasonNumber, episodeNumber } = body;

  await db.insert(watchedEpisodes)
    .values({
      userId: session.user.id,
      tvShowId: tvId,
      seasonNum: seasonNumber,
      episodeNum: episodeNumber,
      watchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [watchedEpisodes.userId, watchedEpisodes.tvShowId, watchedEpisodes.seasonNum, watchedEpisodes.episodeNum],
      set: {
        watchedAt: new Date(),
      },
    });

  return { success: true };
});
