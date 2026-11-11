<script lang="ts" setup>
import type { Movie } from "~/models/apiModels/watch/MovieModels";
import type { TVShow } from "~/models/apiModels/watch/TvModels";

const watchStore = useWatchStore();
const { searchQuery } = storeToRefs(watchStore);

// Debounce typing; vue-query keys each request by its query string, so a slow
// response for an older query can never overwrite a newer one.
const debouncedQuery = refDebounced(searchQuery, 200);
const { data, isPlaceholderData, isFetching } = useSearch(debouncedQuery);
// This component stays mounted, so without this a new search would briefly
// show the results of the search that was cleared before it.
const searchResults = useCurrentSearchResults(debouncedQuery, data, isPlaceholderData);

const movies = computed(
    () =>
        (searchResults.value?.results.filter(
            (result) => result.media_type === "movie",
        ) ?? []) as Movie[],
);
const tvShows = computed(
    () =>
        (searchResults.value?.results.filter(
            (result) => result.media_type === "tv",
        ) ?? []) as TVShow[],
);
const hasResults = computed(
    () => movies.value.length > 0 || tvShows.value.length > 0,
);
</script>

<template>
    <div>
        <h4 class="md:text-2xl text-xl">Search Results:</h4>
        <div class="flex flex-nowrap  gap-4" v-if="hasResults">
            <div class="flex-1 w-1/2">
                <h5 class="md:text-4xl text-2xl">Movies</h5>
                <div class="flex flex-wrap gap-4">
                    <div v-for="movie in movies" :key="movie.id"
                        class=" md:w-[200px] w-[150px]">
                        <WatchMovieIcon :movie="movie" />
                    </div>
                </div>
            </div>
            <div class="flex-1 w-1/2">
                <h5 class="md:text-4xl text-2xl">TV Shows</h5>
                <div class="flex flex-wrap gap-4">
                    <div v-for="tv in tvShows" :key="tv.id" class="md:w-[200px] w-[150px]">
                        <WatchTvIcon :tv-show="tv" />
                    </div>
                </div>
            </div>
        </div>
        <div v-else-if="isFetching">
            <p>Searching...</p>
        </div>
        <div v-else>
            <p>No Results Yet!</p>
        </div>
    </div>
</template>
