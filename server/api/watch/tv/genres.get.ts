export default defineEventHandler(async () => {
  return await tmdbFetch("genre/tv/list?language=en-US");
});
