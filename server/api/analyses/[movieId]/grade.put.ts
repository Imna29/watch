import { ANALYSIS_GRADER, VIEWER_NAMES } from "~/models/Viewer";

// Sets or replaces the Grade and remark of the movie's Analysis. Only the
// grader may.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { movieId } = await getValidatedRouterParams(event, movieIdParamsSchema.parse);
  const { grade, remark } = await readValidatedBody(event, gradeBodySchema.parse);

  const result = await useAnalyses().grade(viewer, movieId, grade, remark);
  switch (result.outcome) {
    case "wrong-viewer":
      throw createError({
        statusCode: 403,
        statusMessage: `Only ${VIEWER_NAMES[ANALYSIS_GRADER]} grades Analyses`,
      });
    case "no-analysis":
      throw createError({ statusCode: 404, statusMessage: "This movie has no Analysis" });
    case "graded":
      return { analysis: result.analysis };
  }
});
