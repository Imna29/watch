// Every Analysis, for either Viewer: ungraded first, then newest first by
// first submission, with the average Grade (null while none is graded) and
// the count of Analyses to grade (zero for anyone but the grader).
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const analyses = useAnalyses();

  const [list, toGrade] = await Promise.all([analyses.list(viewer), analyses.toGrade(viewer)]);
  return { analyses: list.analyses, average: list.average, toGrade };
});
