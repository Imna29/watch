export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  return await tmdbFetch(`tv/${id}?append_to_response=videos,recommendations,similar&language=en-US`);
});
