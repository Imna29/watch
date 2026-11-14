import { watchedEpisodes } from "../../database/watch-schema";
import { db } from "../../database/db";

export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { tvId, seasonNumber, episodeNumber } = await readValidatedBody(event, watchedEpisodeBodySchema.parse);

  await db.insert(watchedEpisodes)
    .values({
      viewer,
      tvShowId: tvId,
      seasonNum: seasonNumber,
      episodeNum: episodeNumber,
      watchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [watchedEpisodes.viewer, watchedEpisodes.tvShowId, watchedEpisodes.seasonNum, watchedEpisodes.episodeNum],
      set: {
        watchedAt: new Date(),
      },
    });

  return { success: true };
});
