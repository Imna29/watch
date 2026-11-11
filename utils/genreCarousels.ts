import type Genre from "~/models/apiModels/watch/Genre";

export type CarouselSort = "vote_average.desc" | "popularity.desc";

export interface CarouselItem {
  /** Unique, stable key for v-for. */
  id: number;
  genre: Genre;
  sortBy: CarouselSort;
  isMovie: boolean;
}

const SORT_OPTIONS: CarouselSort[] = ["vote_average.desc", "popularity.desc"];

function pickRandom<T>(items: T[], random: () => number): T | undefined {
  if (items.length === 0) return undefined;
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index];
}

/**
 * Chooses the next carousel row: a random not-yet-used genre of the preferred
 * type, falling back to the other type when the preferred one is exhausted.
 * Returns null when every genre of both types has been used.
 * Pure: does not mutate the "used" sets — the caller records the pick.
 */
export function pickNextCarouselItem(input: {
  nextId: number;
  preferMovie: boolean;
  movieGenres: Genre[];
  tvGenres: Genre[];
  usedMovieGenreIds: ReadonlySet<number>;
  usedTvGenreIds: ReadonlySet<number>;
  random?: () => number;
}): CarouselItem | null {
  const random = input.random ?? Math.random;
  const typeOrder = input.preferMovie ? [true, false] : [false, true];

  for (const isMovie of typeOrder) {
    const genres = isMovie ? input.movieGenres : input.tvGenres;
    const used = isMovie ? input.usedMovieGenreIds : input.usedTvGenreIds;
    const genre = pickRandom(
      genres.filter((candidate) => !used.has(candidate.id)),
      random,
    );

    if (genre) {
      return {
        id: input.nextId,
        genre,
        sortBy: pickRandom(SORT_OPTIONS, random) ?? "popularity.desc",
        isMovie,
      };
    }
  }

  return null;
}
