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

  it("includes every discover parameter in the key", () => {
    expect(queryKeys.movies.discover([1, 2], "popularity.desc", 3)).toEqual([
      "movies", "discover", [1, 2], "popularity.desc", 3,
    ]);
  });
});
