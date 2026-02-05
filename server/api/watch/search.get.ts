export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const s = query.s as string;

  if (!s) {
    throw createError({
      statusCode: 400,
      statusMessage: "Search query 's' is required.",
    });
  }

  return await tmdbFetch(`search/multi?query=${encodeURIComponent(s)}&language=en-US`);
});
