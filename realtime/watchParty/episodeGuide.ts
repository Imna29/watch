/**
 * Which episode of a TV show comes next, on the device: party sync asks when
 * an episode ends and tells the coordinator, which never looks TMDB up
 * itself. The episodes come in through an `EpisodeGuide`: the TV show query
 * in the browser (`composables/useWatchParty.ts`), a fake in seam 1.
 */
import type { Episode } from "./protocol";

/** A TV show's episodes, as TMDB's TV show details list them. */
export interface ShowEpisodes {
  seasons: readonly { season_number: number; episode_count: number }[];
  /** The newest episode that has aired; null before the first. */
  last_episode_to_air: { season_number: number; episode_number: number } | null;
}

/** Where party sync finds a TV show's episodes. */
export interface EpisodeGuide {
  episodesOf(tmdbId: number): Promise<ShowEpisodes>;
}

function isAfter(a: Episode, b: Episode) {
  return a.season > b.season || (a.season === b.season && a.episode > b.episode);
}

/**
 * The episode after `current`: the next one in its season, else the first
 * of the next season that has episodes. Null after the show's final
 * episode, which is the last one aired so far.
 */
export function episodeAfter(show: ShowEpisodes, current: Episode): Episode | null {
  const season = show.seasons.find(({ season_number }) => season_number === current.season);
  const nextSeason = show.seasons
    .filter(({ season_number, episode_count }) => season_number > current.season && episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number)[0];
  const next =
    season && current.episode < season.episode_count
      ? { season: current.season, episode: current.episode + 1 }
      : nextSeason
        ? { season: nextSeason.season_number, episode: 1 }
        : null;
  const lastAired = show.last_episode_to_air;
  if (!next || !lastAired) return null;
  return isAfter(next, { season: lastAired.season_number, episode: lastAired.episode_number }) ? null : next;
}
