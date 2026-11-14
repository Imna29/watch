// How many Analyses wait for a Grade: the ungraded ones for the grader, zero
// for anyone else. For the header, so it doesn't load every Analysis on every page.
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);

  return { count: await useAnalyses().toGrade(viewer) };
});
