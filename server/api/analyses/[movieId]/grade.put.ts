// Sets or replaces the Grade and remark of the movie's Analysis. Only the
// grader may.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);
  const { grade, remark } = await readValidatedBody(event, gradeBodySchema.parse);

  const result = await useAnalyses().grade(viewer, movieId, grade, remark);
  if (result.outcome !== "graded") throw analysisRefusal("grade", result.outcome);
  return { analysis: result.analysis };
});
