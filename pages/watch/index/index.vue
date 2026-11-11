<script setup lang="ts">
definePageMeta({
    layout: "watch-layout",
    keepalive: true,
    auth: false,
});

const { data: movieGenres, isPending: isLoadingMovieGenres } = useMovieGenres();
const { data: tvGenres, isPending: isLoadingTvGenres } = useTvGenres();

const isLoading = computed(() => isLoadingMovieGenres.value || isLoadingTvGenres.value);

const { carouselItems } = useGenreCarousels({
    movieGenres: () => movieGenres.value?.genres,
    tvGenres: () => tvGenres.value?.genres,
});
</script>
<template>
    <div class="mt-2">
        <WatchTrendingAll />
        <div v-if="isLoading" class="flex justify-center py-4">
            <span>Loading...</span>
        </div>
        <div v-else>
            <div v-for="item in carouselItems" :key="item.id">
                <WatchDiscoverMoviesCarousel v-if="item.isMovie" :sortBy="item.sortBy" :genre="item.genre"
                    class="mt-4" />
                <WatchDiscoverTvCarousel v-else :sortBy="item.sortBy" :genre="item.genre" class="mt-4" />
            </div>
        </div>
    </div>
</template>

<style scoped></style>
