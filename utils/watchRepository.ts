import type { $Fetch, NitroFetchRequest } from "nitropack";
import type LastWatched from "~/models/apiModels/watch/LastWatched";
import type {
  GenreResponse,
  MovieDetails,
  MovieOrTvResponse,
  MovieResponse,
} from "~/models/apiModels/watch/MovieModels";
import type {
  WatchPlaylist,
  WatchPlaylistWithItems,
} from "~/models/apiModels/watch/Playlist";
import type { SearchResponse } from "~/models/apiModels/watch/SearchResult";
import type SeasonData from "~/models/apiModels/watch/SeasonData";
import type {
  TVShowsResponse,
  TVShowDetails,
} from "~/models/apiModels/watch/TvModels";
import type WatchedEpisode from "~/models/apiModels/watch/WatchedEpisode";

function buildDiscoverQuery(
  ids: number[],
  sortBy: "popularity.desc" | "vote_average.desc",
  page: number,
) {
  const params = new URLSearchParams();

  if (ids.length > 0) {
    params.append("genre_ids", ids.join(","));
  }

  params.append("sort_by", sortBy);
  params.append("page", page.toString());

  return params;
}

export const watchRepository = <T>(fetch: $Fetch<T, NitroFetchRequest>) => ({
  async getTrendingMovies(time: "day" | "week") {
    return fetch<MovieResponse>(`/watch/movie/trending/${time}`);
  },

  async getTrendingAll(time: "day" | "week") {
    return fetch<MovieOrTvResponse>(`/watch/all/trending/${time}`);
  },
  async discoverMovies(
    ids: number[],
    sortBy: "popularity.desc" | "vote_average.desc",
    page: number,
  ) {
    const params = buildDiscoverQuery(ids, sortBy, page);
    return fetch<MovieResponse>(`/watch/movie/discover?${params.toString()}`);
  },
  async discoverTv(
    ids: number[],
    sortBy: "popularity.desc" | "vote_average.desc",
    page: number,
  ) {
    const params = buildDiscoverQuery(ids, sortBy, page);
    return fetch<TVShowsResponse>(`/watch/tv/discover?${params.toString()}`);
  },
  async getMovieGenres() {
    return fetch<GenreResponse>("/watch/movie/genres");
  },
  async getTvGenres() {
    return fetch<GenreResponse>("/watch/tv/genres");
  },
  async getMovieById(id: number) {
    return fetch<MovieDetails>(`/watch/movie/${id}`);
  },
  async getTvById(id: number) {
    return fetch<TVShowDetails>(`/watch/tv/${id}`);
  },

  async getSeasonData(tvId: number, seasonNumber: number) {
    return fetch<SeasonData>(`/watch/tv/${tvId}/season/${seasonNumber}`);
  },
  async search(query: string) {
    return fetch<SearchResponse>(`/watch/search?s=${query}`);
  },

  // Playlists
  async getAllPlaylists() {
    return fetch<WatchPlaylist[]>(`/playlists`);
  },

  async createPlaylist(name: string) {
    return fetch(`/playlists`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async getPlaylist(playlistId: string) {
    return fetch<WatchPlaylist>(`/playlists/${playlistId}`);
  },

  async deletePlaylist(playlistId: string) {
    return fetch(`/playlists/${playlistId}`, {
      method: "DELETE",
    });
  },

  // Playlist Items
  async getPlaylistItems(playlistId: string) {
    return fetch<WatchPlaylistWithItems>(`/playlists/${playlistId}/items`);
  },

  async addToPlaylist(
    playlistId: string,
    contentId: number,
    contentType: "MOVIE" | "TV_SHOW",
  ) {
    return fetch(`/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ contentId, contentType }),
    });
  },

  async deleteFromPlaylist(playlistId: string, itemIds: string[]) {
    return fetch(`/playlists/${playlistId}/items`, {
      method: "DELETE",
      body: JSON.stringify({ itemIds }),
    });
  },

  // Watched Episodes
  async getWatchedEpisodes() {
    return fetch<WatchedEpisode[]>(`/watched-episodes`);
  },

  async getLastWatchedEpisodes(tvId: number) {
    return fetch<LastWatched>(`/watched-episodes/${tvId}/last`);
  },

  async addWatchedEpisode(
    tvId: number,
    seasonNumber: number,
    episodeNumber: number,
  ) {
    return fetch(`/watched-episodes`, {
      method: "POST",
      body: JSON.stringify({ tvId, seasonNumber, episodeNumber }),
    });
  },
});
