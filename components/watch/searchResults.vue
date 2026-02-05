<script lang="ts" setup>
const watchStore = useWatchStore();

</script>

<template>
    <div>
        <h4 class="md:text-2xl text-xl">Search Results:</h4>
        <div class="flex flex-nowrap  gap-4"
            v-if="watchStore.searchResults !== null && (watchStore.searchResultsFiltered.movies.length > 0 || watchStore.searchResultsFiltered.tvShows.length > 0)">
            <div class="flex-1 w-1/2">
                <h5 class="md:text-4xl text-2xl">Movies</h5>
                <div class="flex flex-wrap gap-4">
                    <div v-for="movie in watchStore.searchResultsFiltered.movies" :key="movie.id"
                        class=" md:w-[200px] w-[150px]">
                        <WatchMovieIcon :movie="movie" />
                    </div>
                </div>
            </div>
            <div class="flex-1 w-1/2">
                <h5 class="md:text-4xl text-2xl">TV Shows</h5>
                <div class="flex flex-wrap gap-4">
                    <div v-for="tv in watchStore.searchResultsFiltered.tvShows" :key="tv.id" class="md:w-[200px] w-[150px]">
                        <WatchTvIcon :tv-show="tv" />
                    </div>
                </div>
            </div>
        </div>
        <div v-else>
            <p>No Results Yet!</p>
        </div>
    </div>
</template>