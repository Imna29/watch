export default defineEventHandler(async (event) => {
  const viewer = requireViewer(event);
  const { playlistId } = await getValidatedRouterParams(event, playlistParamsSchema.parse);
  const { contentId, contentType } = await readValidatedBody(event, addPlaylistItemBodySchema.parse);
  await requireOwnedPlaylist(playlistId, viewer);

  await addPlaylistItem(playlistId, contentType, contentId);

  return { success: true };
});
