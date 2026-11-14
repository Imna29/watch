import { ANALYSIS_GRADER, ANALYSIS_WRITER, VIEWER_NAMES } from "~/models/Viewer";

// Writes the movie's Analysis, or replaces its text. Only the writer may, and
// only until it is graded.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);
  const { text } = await readValidatedBody(event, analysisBodySchema.parse);

  const result = await useAnalyses().write(viewer, movieId, text);
  switch (result.outcome) {
    case "wrong-viewer":
      throw createError({
        statusCode: 403,
        statusMessage: `Only ${VIEWER_NAMES[ANALYSIS_WRITER]} writes Analyses`,
      });
    case "already-graded":
      throw createError({
        statusCode: 409,
        statusMessage: `Already graded: ${VIEWER_NAMES[ANALYSIS_GRADER]} graded this Analysis`,
      });
    case "written":
      return { analysis: result.analysis };
  }
});
