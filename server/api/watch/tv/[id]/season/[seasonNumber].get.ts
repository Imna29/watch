export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const seasonNumber = getRouterParam(event, "seasonNumber");
  return await tmdbFetch(`tv/${id}/season/${seasonNumber}?language=en-US`);
});
