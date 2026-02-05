export default defineEventHandler(async (event) => {
  const time = getRouterParam(event, "time");

  if (time !== "day" && time !== "week") {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid time parameter. Must be 'day' or 'week'.",
    });
  }

  return await tmdbFetch(`trending/movie/${time}?language=en-US`);
});
