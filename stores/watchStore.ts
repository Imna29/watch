import type LastWatched from "~/models/apiModels/watch/LastWatched";
import type { Movie } from "~/models/apiModels/watch/MovieModels";
import type { WatchPlaylist } from "~/models/apiModels/watch/Playlist";
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
  const playlists = ref<WatchPlaylist[] | null>(null);
  const toast = useToast();

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

  async function fetchAllPlaylists() {
    playlists.value = await watchRepo.getAllPlaylists();
    return playlists.value;
  }

  async function getAllPlaylists(): Promise<WatchPlaylist[]> {
    return await fetchAllPlaylists();
  }

  async function getLastWatchedEpisode(tvId: number): Promise<LastWatched> {
    return watchRepo.getLastWatchedEpisodes(tvId);
  }

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

  async function saveForLater(
    title: string,
    id: number,
    contentType: "MOVIE" | "TV_SHOW",
  ) {
    const { loggedIn } = useAuth();
    if (!loggedIn.value) {
      toast.add({
        severity: "warn",
        summary: "Sign in required",
        detail: "Please sign in to save items for later",
        life: 3000
      });
      return;
    }
    
    const laterPlaylist = (await getAllPlaylists()).filter(
      (playlist) => playlist.type === "WATCH_LATER",
    )[0];
    watchRepo.addToPlaylist(laterPlaylist.id, id, contentType);
    toast.add({
      severity: "success",
      summary: `${contentType === 'MOVIE' ? 'Movie' : 'Show'} saved for later`,
      detail: `${title} has been saved for later`,
      life: 3000
    });

  }

  async function getPlaylistItems(playlistId: string) {
    return watchRepo.getPlaylistItems(playlistId);
  }

  return {
    watchRepo,
    searchQuery,
    isSearching,
    clearSearch,
    searchResults,
    searchResultsFiltered,
    getAllPlaylists,
    playlists,
    getLastWatchedEpisode,
    saveForLater,
    getPlaylistItems,
  };
});
