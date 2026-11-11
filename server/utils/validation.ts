import { z } from "zod";

const PG_INT_MAX = 2_147_483_647;

// TMDB ids arriving as route params (strings) — coerced to a positive integer.
export const tmdbIdSchema = z.coerce.number().int().positive().max(PG_INT_MAX);

// Season 0 is "Specials" on TMDB, so 0 is valid.
export const seasonNumberSchema = z.coerce.number().int().min(0).max(10_000);

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
  contentId: z.number().int().positive().max(PG_INT_MAX),
  contentType: z.enum(["MOVIE", "TV_SHOW"]),
});

export const deletePlaylistItemsBodySchema = z.object({
  itemIds: z.array(z.string().uuid()).max(500),
});

export const watchedEpisodeBodySchema = z.object({
  tvId: z.number().int().positive().max(PG_INT_MAX),
  seasonNumber: z.number().int().min(0).max(10_000),
  episodeNumber: z.number().int().min(0).max(100_000),
});

// Comma-separated TMDB genre ids, e.g. "28,12".
export const genreIdsSchema = z.string().regex(/^\d+(,\d+)*$/).max(200);
