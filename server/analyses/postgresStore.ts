import { eq, isNull } from "drizzle-orm";
import type { db as appDb } from "../database/db";
import { analyses } from "../database/schema";
import type { Analysis, AnalysisStore } from "./analyses";

type Database = typeof appDb;

/** The `AnalysisStore` over the `analyses` table. Each operation is one statement. */
export function createPostgresAnalysisStore(db: Database): AnalysisStore {
  return {
    async find(movieId) {
      const [row] = await db.select().from(analyses).where(eq(analyses.movieId, movieId)).limit(1);
      return row ? toAnalysis(row) : null;
    },

    // `insert ... on conflict do update ... where grade is null`: on a graded
    // row the update is skipped and nothing is returned.
    async writeUnlessGraded(movieId, text, at) {
      const [row] = await db
        .insert(analyses)
        .values({ movieId, text, submittedAt: at, editedAt: at })
        .onConflictDoUpdate({
          target: analyses.movieId,
          set: { text, editedAt: at },
          setWhere: isNull(analyses.grade),
        })
        .returning();
      return row ? toAnalysis(row) : null;
    },

    async grade(movieId, grade, remark, at) {
      const [row] = await db
        .update(analyses)
        .set({ grade, remark, gradedAt: at })
        .where(eq(analyses.movieId, movieId))
        .returning();
      return row ? toAnalysis(row) : null;
    },
  };
}

function toAnalysis(row: typeof analyses.$inferSelect): Analysis {
  return {
    movieId: row.movieId,
    text: row.text,
    submittedAt: row.submittedAt,
    editedAt: row.editedAt,
    grade: row.grade,
    remark: row.remark,
    gradedAt: row.gradedAt,
  };
}
