import { and, eq, desc } from "drizzle-orm";
import { db } from "../../../database/db";
import { watchedEpisodes } from "../../../database/watch-schema";

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event);
  const tvId = parseInt(getRouterParam(event, "tvId")!);

  const [lastEpisodeWatched] = await db.select()
    .from(watchedEpisodes)
    .where(
      and(
        eq(watchedEpisodes.userId, session.user.id),
        eq(watchedEpisodes.tvShowId, tvId)
      )
    )
    .orderBy(desc(watchedEpisodes.seasonNum), desc(watchedEpisodes.episodeNum))
    .limit(1);

  const [recentEpisodeWatched] = await db.select()
    .from(watchedEpisodes)
    .where(
      and(
        eq(watchedEpisodes.userId, session.user.id),
        eq(watchedEpisodes.tvShowId, tvId)
      )
    )
    .orderBy(desc(watchedEpisodes.watchedAt))
    .limit(1);

  return {
    lastEpisodeWatched,
    recentEpisodeWatched,
  };
});
