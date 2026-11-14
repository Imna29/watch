/**
 * The rule for a TMDB id that comes from a browser: a positive integer that
 * fits the Postgres `integer` columns it goes into (History, episode
 * progress, playlist items). Framework-free: the API's validation
 * (`server/utils/validation.ts`) and the Watch Party coordinator use it.
 */
import { z } from "zod";

/** The largest Postgres `integer`. */
export const PG_INT_MAX = 2_147_483_647;

/** A TMDB id, as a number. */
export const tmdbIdNumberSchema = z.number().int().positive().max(PG_INT_MAX);
