import type { Viewer } from "../../Viewer";

export default interface WatchedEpisode {
    id: string;
    episodeNum: number;
    seasonNum: number;
    tvShowId:number;
    watchedAt: Date;
    viewer: Viewer;
}