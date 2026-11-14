// Every Analysis, for either Viewer: ungraded first, then newest first by
// first submission, with the average Grade (null while none is graded).
export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);

  const { analyses, average } = await useAnalyses().list(viewer);
  return { analyses, average };
});
