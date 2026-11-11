export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, tmdbIdParamsSchema.parse);
  return await tmdbFetch(`movie/${id}?append_to_response=videos,recommendations,similar&language=en-US`);
});
