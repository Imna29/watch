export default defineEventHandler(async () => {
  return await tmdbFetch("genre/movie/list?language=en-US");
});
