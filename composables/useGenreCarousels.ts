import type Genre from "~/models/apiModels/watch/Genre";
import { pickNextCarouselItem, type CarouselItem } from "~/utils/genreCarousels";

/**
 * Infinite list of genre carousel rows for a browse page.
 * Pass `movieGenres`, `tvGenres`, or both (both = rows alternate movie / TV).
 * A source that is passed but still `undefined` means "not loaded yet".
 */
export function useGenreCarousels(options: {
  movieGenres?: MaybeRefOrGetter<Genre[] | undefined>;
  tvGenres?: MaybeRefOrGetter<Genre[] | undefined>;
  /** Rows added as soon as the genre lists are available. */
  initialCount?: number;
  /** Rows added each time the user scrolls to the bottom. */
  batchSize?: number;
  /** Distance from the bottom of the page, in px, that counts as "at the bottom". */
  bottomOffset?: number;
}) {
  const { initialCount = 4, batchSize = 2, bottomOffset = 100 } = options;
  const hasMovies = options.movieGenres !== undefined;
  const hasTv = options.tvGenres !== undefined;

  const carouselItems = ref<CarouselItem[]>([]);
  const usedMovieGenreIds = new Set<number>();
  const usedTvGenreIds = new Set<number>();
  const { y } = useWindowScroll();

  let nextId = 0;
  let initialized = false;
  // These pages are kept alive; window scroll is global, so a deactivated page
  // must not keep adding rows while the user scrolls a different page.
  let isActive = true;

  const isReady = computed(
    () =>
      (!hasMovies || toValue(options.movieGenres) !== undefined) &&
      (!hasTv || toValue(options.tvGenres) !== undefined),
  );

  function addItems(count: number) {
    for (let i = 0; i < count; i++) {
      const item = pickNextCarouselItem({
        nextId,
        preferMovie: hasMovies && (!hasTv || carouselItems.value.length % 2 === 0),
        movieGenres: toValue(options.movieGenres) ?? [],
        tvGenres: toValue(options.tvGenres) ?? [],
        usedMovieGenreIds,
        usedTvGenreIds,
      });
      if (!item) return; // every genre has been shown

      nextId++;
      (item.isMovie ? usedMovieGenreIds : usedTvGenreIds).add(item.genre.id);
      carouselItems.value.push(item);
    }
  }

  // `immediate` matters: when the genre queries are already cached, `isReady`
  // is true on the first run and never "changes".
  watch(
    isReady,
    (ready) => {
      if (ready && !initialized) {
        initialized = true;
        addItems(initialCount);
      }
    },
    { immediate: true },
  );

  watch(y, async () => {
    if (!initialized || !isActive) return;
    await nextTick();
    const atBottom =
      window.innerHeight + y.value >=
      document.documentElement.scrollHeight - bottomOffset;
    if (atBottom) addItems(batchSize);
  });

  onActivated(() => {
    isActive = true;
  });
  onDeactivated(() => {
    isActive = false;
  });

  return { carouselItems };
}
