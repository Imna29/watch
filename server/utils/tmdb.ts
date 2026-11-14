import { createError } from "h3";
import { ofetch } from "ofetch";

/** What TMDB answers when it refuses the site's API key (TMDB_API_KEY). */
const TMDB_AUTH_FAILURES = new Set([401, 403]);

export interface TmdbFetchOptions {
  /** The site's TMDB API key, read on every request. */
  apiKey: () => string | undefined;
  /** The `fetch` that reaches TMDB; the global one by default (tests pass a fake). */
  fetch?: typeof globalThis.fetch;
}

/**
 * A client for TMDB's API, for the `/api/watch/**` proxy. TMDB's failures
 * pass on to the browser, except its refusing the site's API key: that is
 * the server's problem, not the Viewer's sign-in (the browser takes a 401
 * from the API for that), so it becomes a 502.
 */
export function createTmdbFetch({ apiKey, fetch }: TmdbFetchOptions) {
  return ofetch.create(
    {
      baseURL: "https://api.themoviedb.org/3",
      onRequest({ options }) {
        const key = apiKey();
        if (key) {
          options.headers.set("Authorization", `Bearer ${key}`);
          options.headers.set("Accept", "application/json");
        }
      },
      onResponseError({ response }) {
        if (!TMDB_AUTH_FAILURES.has(response.status)) return;
        console.error(`TMDB refused the site's API key (${response.status}): check TMDB_API_KEY.`);
        throw createError({ statusCode: 502, statusMessage: "TMDB refused the site's API key" });
      },
    },
    fetch ? { fetch } : {},
  );
}

export const tmdbFetch = createTmdbFetch({
  apiKey: () => process.env.TMDB_API_KEY || String(useRuntimeConfig().tmdbApiKey ?? ""),
});
