import type { Analysis, AnalysisStore } from "./analyses";

/** An `AnalysisStore` in memory, behaving like the Postgres one. For tests. */
export function createMemoryAnalysisStore(): AnalysisStore {
  const byMovie = new Map<number, Analysis>();

  return {
    async find(movieId) {
      const analysis = byMovie.get(movieId);
      return analysis ? { ...analysis } : null;
    },
    async all() {
      return [...byMovie.values()].map((analysis) => ({ ...analysis }));
    },
    async writeUnlessGraded(movieId, text, at) {
      const existing = byMovie.get(movieId);
      if (existing && existing.grade !== null) return null;
      const analysis = existing
        ? { ...existing, text, editedAt: at }
        : { movieId, text, submittedAt: at, editedAt: at, grade: null, remark: null, gradedAt: null };
      byMovie.set(movieId, analysis);
      return { ...analysis };
    },
    async grade(movieId, grade, remark, at) {
      const existing = byMovie.get(movieId);
      if (!existing) return null;
      const analysis = { ...existing, grade, remark, gradedAt: at };
      byMovie.set(movieId, analysis);
      return { ...analysis };
    },
  };
}
