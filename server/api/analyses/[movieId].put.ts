import { ANALYSIS_WRITER, VIEWER_NAMES } from "~/models/Viewer";

// Writes the movie's Analysis, or replaces its text. Only the writer may.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);
  const { text } = await readValidatedBody(event, analysisBodySchema.parse);

  const result = await useAnalyses().write(viewer, movieId, text);
  if (result.outcome === "wrong-viewer") {
    throw createError({
      statusCode: 403,
      statusMessage: `Only ${VIEWER_NAMES[ANALYSIS_WRITER]} writes Analyses`,
    });
  }
  return { analysis: result.analysis };
});
