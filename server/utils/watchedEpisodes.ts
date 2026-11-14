import { db } from "../database/db";
import { watchedEpisodes } from "../database/watch-schema";
import type { Viewer } from "~/models/Viewer";

/** Records that `viewer` watched an episode; watching it again moves it to now. */
export async function recordWatchedEpisode(
  viewer: Viewer,
  tvShowId: number,
  seasonNum: number,
  episodeNum: number,
) {
  await db.insert(watchedEpisodes)
    .values({
      viewer,
      tvShowId,
      seasonNum,
      episodeNum,
      watchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [watchedEpisodes.viewer, watchedEpisodes.tvShowId, watchedEpisodes.seasonNum, watchedEpisodes.episodeNum],
      set: {
        watchedAt: new Date(),
      },
    });
}
