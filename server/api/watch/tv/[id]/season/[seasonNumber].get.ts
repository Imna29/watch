export default defineEventHandler(async (event) => {
  const { id, seasonNumber } = await getValidatedRouterParams(event, seasonParamsSchema.parse);
  return await tmdbFetch(`tv/${id}/season/${seasonNumber}?language=en-US`);
});
