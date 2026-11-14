import { ANALYSIS_GRADER, ANALYSIS_WRITER, VIEWER_NAMES } from "~/models/Viewer";
import { createAnalyses, type Analyses } from "../analyses/analyses";
import { createPostgresAnalysisStore } from "../analyses/postgresStore";
import { db } from "../database/db";

let analyses: Analyses | undefined;

/** The process-wide Analyses module (`server/analyses/analyses.ts`), kept in Postgres. */
export function useAnalyses() {
  analyses ??= createAnalyses({ store: createPostgresAnalysisStore(db) });
  return analyses;
}

/** The 403 message for each operation that changes an Analysis: who alone may run it. */
const ONLY = {
  write: `Only ${VIEWER_NAMES[ANALYSIS_WRITER]} writes Analyses`,
  remove: `Only ${VIEWER_NAMES[ANALYSIS_WRITER]} deletes Analyses`,
  grade: `Only ${VIEWER_NAMES[ANALYSIS_GRADER]} grades Analyses`,
} as const;

/**
 * The HTTP error for an Analyses `operation` the module refused: 403 for the
 * wrong Viewer, 404 when the movie has no Analysis, 409 once it is graded.
 */
export function analysisRefusal(
  operation: keyof typeof ONLY,
  outcome: "wrong-viewer" | "no-analysis" | "already-graded",
) {
  switch (outcome) {
    case "wrong-viewer":
      return createError({ statusCode: 403, statusMessage: ONLY[operation] });
    case "no-analysis":
      return createError({ statusCode: 404, statusMessage: "This movie has no Analysis" });
    case "already-graded":
      return createError({
        statusCode: 409,
        statusMessage: `Already graded: ${VIEWER_NAMES[ANALYSIS_GRADER]} graded this Analysis`,
      });
  }
}
