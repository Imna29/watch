import { describe, expect, it } from "vitest";
import { createTmdbFetch } from "../../server/utils/tmdb";

/** TMDB, as far as the proxy can tell: every request gets `status` and `body`. */
function fakeTmdb(status: number, body: unknown) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode;
  }
}

describe("the TMDB proxy", () => {
  it("asks TMDB with the site's API key", async () => {
    const tmdb = fakeTmdb(200, { genres: [] });
    const tmdbFetch = createTmdbFetch({ apiKey: () => "the-site-key", fetch: tmdb.fetch });

    expect(await tmdbFetch("genre/movie/list")).toEqual({ genres: [] });
    expect(tmdb.requests[0]?.url).toBe("https://api.themoviedb.org/3/genre/movie/list");
    expect(tmdb.requests[0]?.headers.get("authorization")).toBe("Bearer the-site-key");
  });

  it("answers 502 when TMDB refuses the site's API key, which is no Viewer's sign-in problem", async () => {
    for (const status of [401, 403]) {
      const tmdb = fakeTmdb(status, { status_code: 7, status_message: "Invalid API key" });
      const tmdbFetch = createTmdbFetch({ apiKey: () => "a-revoked-key", fetch: tmdb.fetch });

      expect(await statusOf(tmdbFetch("movie/438631"))).toBe(502);
    }
  });

  it("passes TMDB's other failures on", async () => {
    const tmdb = fakeTmdb(404, { status_code: 34, status_message: "Not found" });
    const tmdbFetch = createTmdbFetch({ apiKey: () => "the-site-key", fetch: tmdb.fetch });

    expect(await statusOf(tmdbFetch("movie/0"))).toBe(404);
  });
});
