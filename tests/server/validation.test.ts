import { describe, expect, it } from "vitest";
import {
  addPlaylistItemBodySchema,
  analysisBodySchema,
  deletePlaylistItemsBodySchema,
  discoverQuerySchema,
  genreIdsSchema,
  gradeBodySchema,
  movieIdParamsSchema,
  playlistParamsSchema,
  seasonParamsSchema,
  signInBodySchema,
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

describe("movieIdParamsSchema", () => {
  it("holds a movie id to the TMDB id rules", () => {
    expect(movieIdParamsSchema.parse({ movieId: "550" })).toEqual({ movieId: 550 });
    for (const movieId of ["abc", "", "-1", "0", "1.5", "99999999999"]) {
      expect(movieIdParamsSchema.safeParse({ movieId }).success).toBe(false);
    }
  });
});

describe("analysisBodySchema", () => {
  it("trims the text and keeps its line breaks", () => {
    expect(analysisBodySchema.parse({ text: "  First thought.\n\nSecond thought.\n  " })).toEqual({
      text: "First thought.\n\nSecond thought.",
    });
  });

  it("takes up to 2,000 characters, counted after trimming", () => {
    expect(analysisBodySchema.safeParse({ text: "x".repeat(2000) }).success).toBe(true);
    expect(analysisBodySchema.safeParse({ text: ` ${"x".repeat(2000)}\n` }).success).toBe(true);
    expect(analysisBodySchema.safeParse({ text: "x".repeat(2001) }).success).toBe(false);
  });

  it("refuses an empty Analysis", () => {
    for (const body of [{ text: "" }, { text: "  \n\t " }, {}, { text: 42 }, null]) {
      expect(analysisBodySchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("gradeBodySchema", () => {
  it("takes a whole Grade from -1 to 10", () => {
    for (const grade of [-1, 0, 7, 10]) {
      expect(gradeBodySchema.parse({ grade })).toEqual({ grade, remark: null });
    }
    for (const grade of [-2, 11, 7.5, "7", null, undefined]) {
      expect(gradeBodySchema.safeParse({ grade }).success).toBe(false);
    }
    expect(gradeBodySchema.safeParse(null).success).toBe(false);
  });

  it("trims the remark and keeps its line breaks", () => {
    expect(gradeBodySchema.parse({ grade: 8, remark: "  Good.\n\nMissed the ending.\n " })).toEqual({
      grade: 8,
      remark: "Good.\n\nMissed the ending.",
    });
  });

  it("takes a remark of up to 500 characters, counted after trimming", () => {
    expect(gradeBodySchema.safeParse({ grade: 8, remark: "x".repeat(500) }).success).toBe(true);
    expect(gradeBodySchema.safeParse({ grade: 8, remark: ` ${"x".repeat(500)}\n` }).success).toBe(true);
    expect(gradeBodySchema.safeParse({ grade: 8, remark: "x".repeat(501) }).success).toBe(false);
    expect(gradeBodySchema.safeParse({ grade: 8, remark: 42 }).success).toBe(false);
  });

  it("treats an empty or missing remark as no remark", () => {
    for (const body of [{ grade: 5 }, { grade: 5, remark: "" }, { grade: 5, remark: " \n\t " }, { grade: 5, remark: null }]) {
      expect(gradeBodySchema.parse(body)).toEqual({ grade: 5, remark: null });
    }
  });
});

describe("signInBodySchema", () => {
  it("takes one password of a sane length", () => {
    expect(signInBodySchema.parse({ password: "a password" })).toEqual({ password: "a password" });
    for (const body of [{}, { password: "" }, { password: 42 }, { password: "x".repeat(1025) }, null]) {
      expect(signInBodySchema.safeParse(body).success).toBe(false);
    }
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
