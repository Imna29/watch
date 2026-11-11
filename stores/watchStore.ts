import type { Movie } from "~/models/apiModels/watch/MovieModels";
import type { SearchResponse } from "~/models/apiModels/watch/SearchResult";
import type { TVShow } from "~/models/apiModels/watch/TvModels";

export const useWatchStore = defineStore("watchStore", () => {
  const { $apiClient } = useNuxtApp();
  const watchRepo = watchRepository($apiClient);
  const searchQuery = ref<string>("");
  const isSearching = computed(() => searchQuery.value.length > 0);
  const searchResults = ref<SearchResponse | null>(null);
  const router = useRouter();
  const route = useRoute();

  const searchResultsFiltered = computed(() => {
    //Classify as Movies and TV Shows
    const movies: Movie[] =
      (searchResults.value?.results.filter(
        (result) => result.media_type === "movie",
      ) as Movie[]) || [];
    const tvShows: TVShow[] =
      (searchResults.value?.results.filter(
        (result) => result.media_type === "tv",
      ) as TVShow[]) || [];

    return { movies, tvShows };
  });

  // Watch route.query.q and update searchQuery
  watch(
    () => route.query.q,
    (q) => {
      if (q?.toString() !== searchQuery.value) {
        searchQuery.value = q?.toString() || "";
      }
    },
  );

  // Watch searchQuery and update route query parameter
  watch(searchQuery, (query) => {
    if (query !== route.query.q) {
      if (query.length > 0) {
        if (!route.query.q) {
          // Transition from empty to non-empty, push new history entry
          router.push({ query: { ...route.query, q: query } });
        } else {
          // Replace current URL
          router.replace({ query: { ...route.query, q: query } });
        }
      } else {
        // Query is empty, remove 'q' from URL
        const newQuery = { ...route.query };
        delete newQuery.q;
        router.replace({ query: newQuery });
      }
    }
  });

  async function search(query: string): Promise<SearchResponse> {
    return watchRepo.search(query);
  }

  function clearSearch() {
    searchQuery.value = "";
    searchResults.value = null;
  }

  watchDebounced(
    searchQuery,
    async (query) => {
      if (query.length > 0) {
        searchResults.value = await search(query);
      } else {
        searchResults.value = null;
      }
    },
    { debounce: 200 },
  );

  return {
    watchRepo,
    searchQuery,
    isSearching,
    clearSearch,
    searchResults,
    searchResultsFiltered,
  };
});
