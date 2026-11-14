/**
 * Analyses (GLOSSARY.md, "Understanding"): every rule about who may do what
 * with a movie's Analysis. Framework-free: storage comes in through an
 * `AnalysisStore`, time through `now`, and refusals are named outcomes that
 * route handlers map to HTTP statuses.
 */
import { ANALYSIS_GRADER, ANALYSIS_WRITER, type Viewer } from "../../models/Viewer";

/** A movie's Analysis. A movie has at most one. */
export interface Analysis {
  /** The movie's TMDB id. */
  movieId: number;
  text: string;
  /** When it was first submitted. */
  submittedAt: Date;
  /** When its text was last written. */
  editedAt: Date;
  /** The grader's Grade, -1 to 10; null until graded. Once graded, the text is locked. */
  grade: number | null;
  /** The remark given with the Grade; null without one. */
  remark: string | null;
  /** When the current Grade was given; null until graded. */
  gradedAt: Date | null;
}

/** Where Analyses are kept: Postgres in the app (`postgresStore.ts`), memory in tests (`tests/server/memoryAnalysisStore.ts`). */
export interface AnalysisStore {
  /** The movie's Analysis, or null when it has none. */
  find(movieId: number): Promise<Analysis | null>;
  /** Every movie's Analysis, in any order. */
  all(): Promise<Analysis[]>;
  /** How many Analyses are ungraded. */
  countUngraded(): Promise<number>;
  /**
   * Gives the movie an Analysis with `text`, submitted and edited `at`, or,
   * when it has an ungraded one, replaces its text and edited time. Returns it
   * as stored, or null when it is graded: then nothing changes. One
   * conditional operation, so a Grade given meanwhile always wins.
   */
  writeUnlessGraded(movieId: number, text: string, at: Date): Promise<Analysis | null>;
  /**
   * Sets or replaces the movie's Grade and remark, given `at`. Returns the
   * Analysis as stored, or null when the movie has none.
   */
  grade(movieId: number, grade: number, remark: string | null, at: Date): Promise<Analysis | null>;
  /**
   * Deletes the movie's Analysis when it is ungraded. Returns it as it was,
   * or null when nothing was deleted: the movie has none, or it is graded.
   * One conditional operation, so a Grade given meanwhile always wins.
   */
  removeUnlessGraded(movieId: number): Promise<Analysis | null>;
}

export interface AnalysesOptions {
  store: AnalysisStore;
  /** Milliseconds since the epoch. Injected so tests can move time. */
  now?: () => number;
}

export type WriteResult =
  | { outcome: "written"; analysis: Analysis }
  /** The Viewer may not do this (`ANALYSIS_WRITER`, `ANALYSIS_GRADER`). */
  | { outcome: "wrong-viewer" }
  /** The Analysis is graded, so its text is locked. */
  | { outcome: "already-graded" };

export type GradeResult =
  | { outcome: "graded"; analysis: Analysis }
  | { outcome: "wrong-viewer" }
  /** The movie has no Analysis. */
  | { outcome: "no-analysis" };

export type RemoveResult =
  | { outcome: "removed" }
  | { outcome: "wrong-viewer" }
  | { outcome: "no-analysis" }
  | { outcome: "already-graded" };

export function createAnalyses({ store, now = Date.now }: AnalysesOptions) {
  return {
    /**
     * Creates the movie's Analysis, or replaces its text. Only the writer may,
     * and only until it is graded.
     */
    async write(viewer: Viewer, movieId: number, text: string): Promise<WriteResult> {
      if (viewer !== ANALYSIS_WRITER) return { outcome: "wrong-viewer" };
      const analysis = await store.writeUnlessGraded(movieId, text, new Date(now()));
      return analysis ? { outcome: "written", analysis } : { outcome: "already-graded" };
    },

    /**
     * Sets or replaces the movie's Grade and remark: a regrade without a
     * remark clears the old one. Only the grader may.
     */
    async grade(viewer: Viewer, movieId: number, grade: number, remark: string | null): Promise<GradeResult> {
      if (viewer !== ANALYSIS_GRADER) return { outcome: "wrong-viewer" };
      const analysis = await store.grade(movieId, grade, remark, new Date(now()));
      return analysis ? { outcome: "graded", analysis } : { outcome: "no-analysis" };
    },

    /**
     * Deletes the movie's Analysis for good. Only the writer may, and only
     * until it is graded.
     */
    async remove(viewer: Viewer, movieId: number): Promise<RemoveResult> {
      if (viewer !== ANALYSIS_WRITER) return { outcome: "wrong-viewer" };
      if (await store.removeUnlessGraded(movieId)) return { outcome: "removed" };
      // Nothing was deleted. A Grade is never taken back, so a graded
      // Analysis found now was graded when the delete ran.
      const analysis = await store.find(movieId);
      return analysis?.grade != null ? { outcome: "already-graded" } : { outcome: "no-analysis" };
    },

    /** The movie's Analysis, or null when it has none. Either Viewer may read it. */
    async forMovie(_viewer: Viewer, movieId: number): Promise<Analysis | null> {
      return store.find(movieId);
    },

    /**
     * Every Analysis, ungraded first, then newest first by first submission,
     * with the average Grade. Either Viewer may read it.
     */
    async list(_viewer: Viewer): Promise<AnalysisList> {
      const all = await store.all();
      return { analyses: all.sort(inListOrder), average: averageGrade(all) };
    },

    /**
     * How many Analyses wait for a Grade: the ungraded ones for the grader,
     * zero for anyone else, who has nothing to grade.
     */
    async toGrade(viewer: Viewer): Promise<number> {
      if (viewer !== ANALYSIS_GRADER) return 0;
      return store.countUngraded();
    },
  };
}

export type Analyses = ReturnType<typeof createAnalyses>;

/** Every Analysis, as `list` gives it. */
export interface AnalysisList {
  /** Ungraded first, then newest first by first submission. */
  analyses: Analysis[];
  /** The mean Grade of the graded Analyses (-1 counts as -1), to one decimal; null while none is graded. */
  average: number | null;
}

/** `GET /api/analyses`: every Analysis as `list` gives it, with the count `toGrade` gives. */
export interface AnalysisListResponse extends AnalysisList {
  /** How many Analyses wait for a Grade: the ungraded ones for the grader, zero for anyone else. */
  toGrade: number;
}

/** Ungraded before graded; within each, the later first submission first. */
function inListOrder(a: Analysis, b: Analysis): number {
  const ungradedFirst = Number(a.grade !== null) - Number(b.grade !== null);
  return ungradedFirst || b.submittedAt.getTime() - a.submittedAt.getTime();
}

function averageGrade(analyses: Analysis[]): number | null {
  const grades = analyses.flatMap((analysis) => (analysis.grade === null ? [] : [analysis.grade]));
  if (grades.length === 0) return null;
  const sum = grades.reduce((total, grade) => total + grade, 0);
  // Tenths from whole numbers first, so the rounding sees no floating-point error.
  return Math.round((sum * 10) / grades.length) / 10;
}
