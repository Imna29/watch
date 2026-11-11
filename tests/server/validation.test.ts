import { describe, expect, it } from "vitest";
import {
  addPlaylistItemBodySchema,
  deletePlaylistItemsBodySchema,
  discoverQuerySchema,
  genreIdsSchema,
  playlistParamsSchema,
  seasonParamsSchema,
  tmdbIdParamsSchema,
  watchedEpisodeBodySchema,
} from "../../server/utils/validation";

const UUID = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

describe("route param schemas", () => {
  it("accepts a uuid playlist id and rejects anything else", () => {
    expect(playlistParamsSchema.safeParse({ playlistId: UUID }).success).toBe(true);
    expect(playlistParamsSchema.safeParse({ playlistId: "42" }).success).toBe(false);
    expect(playlistParamsSchema.safeParse({}).success).toBe(false);
  });

  it("coerces numeric tmdb ids and rejects non-numeric ones", () => {
    expect(tmdbIdParamsSchema.parse({ id: "550" })).toEqual({ id: 550 });
    for (const id of ["abc", "12abc", "", "-1", "0", "1.5", "..%2Faccount", "99999999999"]) {
      expect(tmdbIdParamsSchema.safeParse({ id }).success).toBe(false);
    }
  });

  it("accepts season 0 (specials) and rejects negative seasons", () => {
    expect(seasonParamsSchema.parse({ id: "1399", seasonNumber: "0" })).toEqual({
      id: 1399,
      seasonNumber: 0,
    });
    expect(seasonParamsSchema.safeParse({ id: "1399", seasonNumber: "-1" }).success).toBe(false);
  });
});

describe("body schemas", () => {
  it("validates add-to-playlist bodies", () => {
    expect(
      addPlaylistItemBodySchema.safeParse({ contentId: 550, contentType: "MOVIE" }).success,
    ).toBe(true);
    expect(
      addPlaylistItemBodySchema.safeParse({ contentId: "550", contentType: "MOVIE" }).success,
    ).toBe(false);
    expect(
      addPlaylistItemBodySchema.safeParse({ contentId: 550, contentType: "BOOK" }).success,
    ).toBe(false);
    expect(addPlaylistItemBodySchema.safeParse(null).success).toBe(false);
  });

  it("validates delete bodies and caps the batch size", () => {
    expect(deletePlaylistItemsBodySchema.safeParse({ itemIds: [] }).success).toBe(true);
    expect(deletePlaylistItemsBodySchema.safeParse({ itemIds: [UUID] }).success).toBe(true);
    expect(deletePlaylistItemsBodySchema.safeParse({ itemIds: ["nope"] }).success).toBe(false);
    expect(
      deletePlaylistItemsBodySchema.safeParse({ itemIds: Array(501).fill(UUID) }).success,
    ).toBe(false);
  });

  it("validates watched-episode bodies", () => {
    expect(
      watchedEpisodeBodySchema.safeParse({ tvId: 1399, seasonNumber: 1, episodeNumber: 1 }).success,
    ).toBe(true);
    expect(
      watchedEpisodeBodySchema.safeParse({ tvId: 1399, seasonNumber: 1 }).success,
    ).toBe(false);
    expect(
      watchedEpisodeBodySchema.safeParse({ tvId: 1399, seasonNumber: 1.5, episodeNumber: 1 }).success,
    ).toBe(false);
    expect(
      watchedEpisodeBodySchema.safeParse({ tvId: -1, seasonNumber: 1, episodeNumber: 1 }).success,
    ).toBe(false);
  });
});

describe("genreIdsSchema", () => {
  it("accepts comma-separated integers only", () => {
    expect(genreIdsSchema.safeParse("28").success).toBe(true);
    expect(genreIdsSchema.safeParse("28,12,16").success).toBe(true);
    for (const value of ["", "28,", ",28", "28|12", "abc", "28&page=2"]) {
      expect(genreIdsSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("discoverQuerySchema", () => {
  it("allows genre_ids to be left out", () => {
    expect(discoverQuerySchema.parse({ sort_by: "popularity.desc", page: "2" })).toEqual({});
  });

  it("validates genre_ids when it is present", () => {
    expect(discoverQuerySchema.parse({ genre_ids: "28,12" })).toEqual({ genre_ids: "28,12" });
    for (const genre_ids of ["", "28,", ["28", "12"]]) {
      expect(discoverQuerySchema.safeParse({ genre_ids }).success).toBe(false);
    }
  });
});
