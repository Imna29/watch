export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { tvId, seasonNumber, episodeNumber } = await readValidatedBody(event, watchedEpisodeBodySchema.parse);

  await recordWatchedEpisode(viewer, tvId, seasonNumber, episodeNumber);

  return { success: true };
});
