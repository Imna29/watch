import { describe, expect, it, vi } from "vitest";
import { watchRepository } from "../../utils/watchRepository";

function makeRepo() {
  const fetch = vi.fn().mockResolvedValue({});
  // The factory only needs a callable; the cast avoids pulling in Nitro types.
  const repo = watchRepository(fetch as any);
  return { fetch, repo };
}

describe("watchRepository", () => {
  it("builds the discover-movies URL with genres, sort and page", async () => {
    const { fetch, repo } = makeRepo();
    await repo.discoverMovies([28, 12], "popularity.desc", 3);
    expect(fetch).toHaveBeenCalledWith(
      "/watch/movie/discover?genre_ids=28%2C12&sort_by=popularity.desc&page=3",
    );
  });

  it("omits genre_ids when no genres are selected", async () => {
    const { fetch, repo } = makeRepo();
    await repo.discoverTv([], "vote_average.desc", 1);
    expect(fetch).toHaveBeenCalledWith(
      "/watch/tv/discover?sort_by=vote_average.desc&page=1",
    );
  });

  it("requests trending endpoints by time window", async () => {
    const { fetch, repo } = makeRepo();
    await repo.getTrendingAll("week");
    await repo.getTrendingMovies("day");
    expect(fetch).toHaveBeenNthCalledWith(1, "/watch/all/trending/week");
    expect(fetch).toHaveBeenNthCalledWith(2, "/watch/movie/trending/day");
  });

  it("posts playlist items as a JSON body", async () => {
    const { fetch, repo } = makeRepo();
    await repo.addToPlaylist("pl-1", 550, "MOVIE");
    expect(fetch).toHaveBeenCalledWith("/playlists/pl-1/items", {
      method: "POST",
      body: JSON.stringify({ contentId: 550, contentType: "MOVIE" }),
    });
  });

  it("posts watched episodes as a JSON body", async () => {
    const { fetch, repo } = makeRepo();
    await repo.addWatchedEpisode(1399, 2, 5);
    expect(fetch).toHaveBeenCalledWith("/watched-episodes", {
      method: "POST",
      body: JSON.stringify({ tvId: 1399, seasonNumber: 2, episodeNumber: 5 }),
    });
  });

  it("gets a movie's Analysis", async () => {
    const { fetch, repo } = makeRepo();
    await repo.getAnalysis(550);
    expect(fetch).toHaveBeenCalledWith("/analyses/550");
  });

  it("puts an Analysis's text as a JSON body", async () => {
    const { fetch, repo } = makeRepo();
    await repo.writeAnalysis(550, "Tyler is the narrator.\nThe ending is a breakdown.");
    expect(fetch).toHaveBeenCalledWith("/analyses/550", {
      method: "PUT",
      body: { text: "Tyler is the narrator.\nThe ending is a breakdown." },
    });
  });

  it("passes the search term as an encoded query parameter", async () => {
    const { fetch, repo } = makeRepo();
    await repo.search("tom & jerry #1");
    expect(fetch).toHaveBeenCalledWith("/watch/search", {
      query: { s: "tom & jerry #1" },
    });
  });
});
