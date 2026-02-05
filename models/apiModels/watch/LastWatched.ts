import type WatchedEpisode from "./WatchedEpisode";

export default interface LastWatched {
    lastEpisodeWatched: WatchedEpisode;
    recentEpisodeWatched: WatchedEpisode;
}