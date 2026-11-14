// The movie's Analysis, for either Viewer; null when it has none.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);

  return { analysis: await useAnalyses().forMovie(viewer, movieId) };
});
