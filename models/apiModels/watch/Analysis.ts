/** The most characters an Analysis may have, after trimming. The server refuses more; the page counts down to it. */
export const ANALYSIS_TEXT_MAX_LENGTH = 2000;

/** A movie's Analysis as the API returns it (`server/analyses/analyses.ts`), dates as ISO strings. */
export interface Analysis {
  /** The movie's TMDB id. */
  movieId: number;
  text: string;
  submittedAt: string;
  editedAt: string;
}
