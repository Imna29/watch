import { WatchPlaylistType } from "~/models/apiModels/watch/Playlist";
import type { HistoryPort } from "~/realtime/watchParty/coordinator";

/**
 * The Watch Party's History port (`realtime/watchParty/coordinator.ts`):
 * writes what both Viewers watched together the way the playlist and
 * watched-episode endpoints do for one Viewer.
 */
export const watchPartyHistory: HistoryPort = {
  async record(viewer, { title, episode }) {
    const history = await findSystemPlaylist(viewer, WatchPlaylistType.HISTORY);
    if (!history) throw new Error(`${viewer} has no History playlist`);
    await addPlaylistItem(history.id, title.contentType, title.tmdbId);
    if (episode) await recordWatchedEpisode(viewer, title.tmdbId, episode.season, episode.episode);
  },
};
