import { createAnalyses, type Analyses } from "../analyses/analyses";
import { createPostgresAnalysisStore } from "../analyses/postgresStore";
import { db } from "../database/db";

let analyses: Analyses | undefined;

/** The process-wide Analyses module (`server/analyses/analyses.ts`), kept in Postgres. */
export function useAnalyses() {
  analyses ??= createAnalyses({ store: createPostgresAnalysisStore(db) });
  return analyses;
}
