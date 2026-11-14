// Deletes the movie's Analysis for good. Only the writer may, and only until
// it is graded. Answers 204 with no body.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);

  const result = await useAnalyses().remove(viewer, movieId);
  if (result.outcome !== "removed") throw analysisRefusal("remove", result.outcome);
  return null;
});
