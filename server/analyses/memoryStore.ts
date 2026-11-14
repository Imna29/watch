import type { Analysis, AnalysisStore } from "./analyses";

/** An `AnalysisStore` in memory, behaving like the Postgres one. For tests. */
export function createMemoryAnalysisStore(): AnalysisStore {
  const byMovie = new Map<number, Analysis>();

  return {
    async find(movieId) {
      const analysis = byMovie.get(movieId);
      return analysis ? { ...analysis } : null;
    },
    async write(movieId, text, at) {
      const existing = byMovie.get(movieId);
      const analysis = existing
        ? { ...existing, text, editedAt: at }
        : { movieId, text, submittedAt: at, editedAt: at };
      byMovie.set(movieId, analysis);
      return { ...analysis };
    },
  };
}
