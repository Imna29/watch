/** The most characters an Analysis may have, after trimming. The server refuses more; the page counts down to it. */
export const ANALYSIS_TEXT_MAX_LENGTH = 2000;

/** The lowest Grade. Below zero is room for a reading worse than none. */
export const GRADE_MIN = -1;
/** The highest Grade. */
export const GRADE_MAX = 10;
/** The most characters a Grade's remark may have, after trimming. */
export const GRADE_REMARK_MAX_LENGTH = 500;

/** A movie's Analysis as the API returns it (`server/analyses/analyses.ts`), dates as ISO strings. */
export interface Analysis {
  /** The movie's TMDB id. */
  movieId: number;
  text: string;
  submittedAt: string;
  editedAt: string;
  /** The Grade, `GRADE_MIN` to `GRADE_MAX`; null until graded. Once graded, the text is locked. */
  grade: number | null;
  /** The remark given with the Grade; null without one. */
  remark: string | null;
  /** When the current Grade was given; null until graded. */
  gradedAt: string | null;
}

/** `GET /api/analyses`: every Analysis, with the average Grade. */
export interface AnalysisList {
  /** Ungraded first, then newest first by first submission. */
  analyses: Analysis[];
  /** The mean Grade of the graded Analyses (-1 counts as -1), to one decimal; null while none is graded. */
  average: number | null;
}
