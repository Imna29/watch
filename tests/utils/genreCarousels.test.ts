import { describe, expect, it } from "vitest";
import { pickNextCarouselItem } from "../../utils/genreCarousels";

const action = { id: 28, name: "Action" };
const comedy = { id: 35, name: "Comedy" };
const drama = { id: 18, name: "Drama" };
const reality = { id: 10764, name: "Reality" };

function pick(overrides: Partial<Parameters<typeof pickNextCarouselItem>[0]> = {}) {
  return pickNextCarouselItem({
    nextId: 7,
    preferMovie: true,
    movieGenres: [action, comedy],
    tvGenres: [drama, reality],
    usedMovieGenreIds: new Set(),
    usedTvGenreIds: new Set(),
    random: () => 0,
    ...overrides,
  });
}

describe("pickNextCarouselItem", () => {
  it("picks a genre of the preferred type and carries the id through", () => {
    expect(pick()).toEqual({
      id: 7,
      genre: action,
      sortBy: "vote_average.desc",
      isMovie: true,
    });
    expect(pick({ preferMovie: false })?.genre).toEqual(drama);
    expect(pick({ preferMovie: false })?.isMovie).toBe(false);
  });

  it("never returns a genre that was already used", () => {
    expect(pick({ usedMovieGenreIds: new Set([28]) })?.genre).toEqual(comedy);
  });

  it("falls back to the other type when the preferred one is exhausted", () => {
    const item = pick({ usedMovieGenreIds: new Set([28, 35]) });
    expect(item?.isMovie).toBe(false);
    expect(item?.genre).toEqual(drama);
  });

  it("returns null when both types are exhausted", () => {
    expect(
      pick({
        usedMovieGenreIds: new Set([28, 35]),
        usedTvGenreIds: new Set([18, 10764]),
      }),
    ).toBeNull();
  });

  it("works for single-type pages (the other list is empty)", () => {
    expect(pick({ tvGenres: [], usedMovieGenreIds: new Set([28, 35]) })).toBeNull();
    expect(pick({ preferMovie: false, movieGenres: [] })?.genre).toEqual(drama);
  });

  it("uses the random source for both the genre and the sort order", () => {
    const item = pick({ random: () => 0.99 });
    expect(item?.genre).toEqual(comedy);
    expect(item?.sortBy).toBe("popularity.desc");
  });
});
