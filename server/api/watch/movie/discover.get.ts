export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  
  const genre_ids = query.genre_ids as string | undefined;
  const sort_by = (query.sort_by as string) || "popularity.desc";
  const page = parseInt((query.page as string) || "1");

  if (!["popularity.desc", "vote_average.desc"].includes(sort_by)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid sort_by parameter.",
    });
  }

  if (isNaN(page) || page < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid page parameter.",
    });
  }

  const queryParams = new URLSearchParams({
    sort_by,
    page: page.toString(),
    language: "en-US",
  });

  if (genre_ids) {
    queryParams.append("with_genres", genre_ids);
  }

  if (sort_by === "vote_average.desc") {
    queryParams.append("vote_count.gte", "100");
  }

  return await tmdbFetch(`discover/movie?${queryParams.toString()}`);
});
