// Queries
export { allOptions, useTrendingAll } from './queries/useAll'
export { discoverOptions, useDiscoverMovies, useDiscoverTv } from './queries/useDiscover'
export { movieOptions, useMovie, useMovieGenres, useTrendingMovies } from './queries/useMovies'
export {
  playlistOptions,
  usePlaylists,
  usePlaylist,
  usePlaylistItems,
  useCreatePlaylist,
  useDeletePlaylist,
  useAddToPlaylist,
  useAddToSystemPlaylist,
  useDeleteFromPlaylist,
} from './queries/usePlaylists'
export { searchOptions, useSearch } from './queries/useSearch'
export { tvOptions, useTvShow, useTvGenres, useTrendingTv, useSeasonData } from './queries/useTv'
export {
  watchedOptions,
  useWatchedEpisodes,
  useWatchedEpisodesByTvId,
  useLastWatchedEpisode,
  useAddWatchedEpisode,
} from './queries/useWatched'
export { viewerOptions, useViewer, useSignIn, useSignOut } from './queries/useViewer'
export { analysisOptions, useMovieAnalysis, useWriteAnalysis } from './queries/useAnalyses'
