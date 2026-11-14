/**
 * Analyses (GLOSSARY.md, "Understanding"): every rule about who may do what
 * with a movie's Analysis. Framework-free: storage comes in through an
 * `AnalysisStore`, time through `now`, and refusals are named outcomes that
 * route handlers map to HTTP statuses.
 */
import { ANALYSIS_WRITER, type Viewer } from "../../models/Viewer";

/** A movie's Analysis. A movie has at most one. */
export interface Analysis {
  /** The movie's TMDB id. */
  movieId: number;
  text: string;
  /** When it was first submitted. */
  submittedAt: Date;
  /** When its text was last written. */
  editedAt: Date;
}

/** Where Analyses are kept: Postgres in the app (`postgresStore.ts`), memory in tests (`memoryStore.ts`). */
export interface AnalysisStore {
  /** The movie's Analysis, or null when it has none. */
  find(movieId: number): Promise<Analysis | null>;
  /**
   * Gives the movie an Analysis with `text`, submitted and edited `at`, or,
   * when it has one, replaces its text and edited time. Returns it as stored.
   */
  write(movieId: number, text: string, at: Date): Promise<Analysis>;
}

export interface AnalysesOptions {
  store: AnalysisStore;
  /** Milliseconds since the epoch. Injected so tests can move time. */
  now?: () => number;
}

export type WriteResult =
  | { outcome: "written"; analysis: Analysis }
  /** The Viewer may not do this (`ANALYSIS_WRITER`, `ANALYSIS_GRADER`). */
  | { outcome: "wrong-viewer" };

export function createAnalyses({ store, now = Date.now }: AnalysesOptions) {
  return {
    /** Creates the movie's Analysis, or replaces its text. Only the writer may. */
    async write(viewer: Viewer, movieId: number, text: string): Promise<WriteResult> {
      if (viewer !== ANALYSIS_WRITER) return { outcome: "wrong-viewer" };
      return { outcome: "written", analysis: await store.write(movieId, text, new Date(now())) };
    },

    /** The movie's Analysis, or null when it has none. Either Viewer may read it. */
    async forMovie(_viewer: Viewer, movieId: number): Promise<Analysis | null> {
      return store.find(movieId);
    },
  };
}

export type Analyses = ReturnType<typeof createAnalyses>;
