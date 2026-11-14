import { describe, expect, it } from "vitest";
import { queryKeys } from "../../composables/queryKeys";

describe("queryKeys", () => {
  it("nests playlist item keys under the playlist key", () => {
    expect(queryKeys.playlists.all).toEqual(["playlists"]);
    expect(queryKeys.playlists.items("abc")).toEqual(["playlists", "abc", "items"]);
  });

  it("nests last-watched keys under the per-show watched key", () => {
    expect(queryKeys.watched.byTvId(42)).toEqual(["watched", 42]);
    expect(queryKeys.watched.last(42)).toEqual(["watched", 42, "last"]);
  });

  it("nests a movie's Analysis key under the one analyses root", () => {
    expect(queryKeys.analyses.all).toEqual(["analyses"]);
    expect(queryKeys.analyses.byMovie(550)).toEqual(["analyses", "movie", 550]);
  });

  it("nests the list of Analyses key under the same analyses root", () => {
    expect(queryKeys.analyses.list()).toEqual(["analyses", "list"]);
  });

  it("nests the to-grade count key under the same analyses root", () => {
    expect(queryKeys.analyses.toGrade()).toEqual(["analyses", "to-grade"]);
  });

  it("includes every discover parameter in the key", () => {
    expect(queryKeys.movies.discover([1, 2], "popularity.desc", 3)).toEqual([
      "movies", "discover", [1, 2], "popularity.desc", 3,
    ]);
  });
});
