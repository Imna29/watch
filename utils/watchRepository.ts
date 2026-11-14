import type { $Fetch, NitroFetchRequest } from "nitropack";
import type { Analysis } from "~/models/apiModels/watch/Analysis";
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
import type { Viewer } from "~/models/Viewer";
import { SIGN_IN_REQUESTS } from "~/utils/signIn";

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
    return fetch<SearchResponse>("/watch/search", { query: { s: query } });
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

  // Analyses
  /** The movie's Analysis; `analysis` is null when it has none. */
  async getAnalysis(movieId: number) {
    return fetch<{ analysis: Analysis | null }>(`/analyses/${movieId}`);
  },

  /**
   * Writes the movie's Analysis, or replaces its text. Only the writer may
   * (403 otherwise), and only until it is graded (409 after).
   */
  async writeAnalysis(movieId: number, text: string) {
    return fetch<{ analysis: Analysis }>(`/analyses/${movieId}`, {
      method: "PUT",
      body: { text },
    });
  },

  /**
   * Deletes the movie's Analysis for good. Only the writer may (403
   * otherwise); 404 when the movie has none, 409 once it is graded.
   */
  async deleteAnalysis(movieId: number) {
    return fetch<void>(`/analyses/${movieId}`, { method: "DELETE" });
  },

  /**
   * Sets or replaces the movie's Grade and remark (null for none). Only the
   * grader may (403 otherwise); 404 when the movie has no Analysis.
   */
  async gradeAnalysis(movieId: number, grade: number, remark: string | null) {
    return fetch<{ analysis: Analysis }>(`/analyses/${movieId}/grade`, {
      method: "PUT",
      body: { grade, remark },
    });
  },

  // Viewer sign-in
  /** The Viewer signed in on this device, or null when it is signed out. */
  async getViewer(): Promise<Viewer | null> {
    try {
      const { viewer } = await fetch<{ viewer: Viewer }>(SIGN_IN_REQUESTS.viewer);
      return viewer;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 401) return null;
      throw error;
    }
  },

  async signIn(password: string) {
    return fetch<{ viewer: Viewer }>(SIGN_IN_REQUESTS.signIn, {
      method: "POST",
      body: { password },
    });
  },

  async signOut() {
    return fetch(SIGN_IN_REQUESTS.signOut, { method: "POST" });
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
