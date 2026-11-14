import { ANALYSIS_GRADER, ANALYSIS_WRITER, VIEWER_NAMES } from "~/models/Viewer";

// Deletes the movie's Analysis for good. Only the writer may, and only until
// it is graded. Answers 204 with no body.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);

  const result = await useAnalyses().remove(viewer, movieId);
  switch (result.outcome) {
    case "wrong-viewer":
      throw createError({
        statusCode: 403,
        statusMessage: `Only ${VIEWER_NAMES[ANALYSIS_WRITER]} deletes Analyses`,
      });
    case "no-analysis":
      throw createError({ statusCode: 404, statusMessage: "This movie has no Analysis" });
    case "already-graded":
      throw createError({
        statusCode: 409,
        statusMessage: `Already graded: ${VIEWER_NAMES[ANALYSIS_GRADER]} graded this Analysis`,
      });
    case "removed":
      return null;
  }
});
