import { z } from "zod";

const PG_INT_MAX = 2_147_483_647;

// A TMDB id: a positive integer that fits a Postgres `integer` column.
const tmdbId = z.number().int().positive().max(PG_INT_MAX);

// Season 0 is "Specials" on TMDB, so 0 is valid.
const seasonNumber = z.number().int().min(0).max(10_000);

// Route params arrive as strings — coerced, then held to the same rules.
export const tmdbIdSchema = z.coerce.number().pipe(tmdbId);
export const seasonNumberSchema = z.coerce.number().pipe(seasonNumber);

export const playlistParamsSchema = z.object({
  playlistId: z.string().uuid(),
});

export const tmdbIdParamsSchema = z.object({
  id: tmdbIdSchema,
});

export const seasonParamsSchema = z.object({
  id: tmdbIdSchema,
  seasonNumber: seasonNumberSchema,
});

export const tvIdParamsSchema = z.object({
  tvId: tmdbIdSchema,
});

export const addPlaylistItemBodySchema = z.object({
  contentId: tmdbId,
  contentType: z.enum(["MOVIE", "TV_SHOW"]),
});

export const deletePlaylistItemsBodySchema = z.object({
  itemIds: z.array(z.string().uuid()).max(500),
});

export const watchedEpisodeBodySchema = z.object({
  tvId: tmdbId,
  seasonNumber,
  episodeNumber: z.number().int().min(0).max(100_000),
});

// The single password field of the sign-in page. Capped so a huge body cannot
// make the password check expensive.
export const signInBodySchema = z.object({
  password: z.string().min(1).max(1024),
});

// Comma-separated TMDB genre ids, e.g. "28,12".
export const genreIdsSchema = z.string().regex(/^\d+(,\d+)*$/).max(200);

// Query of the discover routes. The client leaves genre_ids out when no genre
// is selected; sort_by and page are checked in the handlers.
export const discoverQuerySchema = z.object({
  genre_ids: genreIdsSchema.optional(),
});
