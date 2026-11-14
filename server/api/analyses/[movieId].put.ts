// Writes the movie's Analysis, or replaces its text. Only the writer may, and
// only until it is graded.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);
  const { text } = await readValidatedBody(event, analysisBodySchema.parse);

  const result = await useAnalyses().write(viewer, movieId, text);
  if (result.outcome !== "written") throw analysisRefusal("write", result.outcome);
  return { analysis: result.analysis };
});
