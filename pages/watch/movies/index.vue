<script setup lang="ts">
definePageMeta({
    layout: "watch-layout",
    keepalive: true,
});

const { data: movieGenres, isPending: isLoadingGenres } = useMovieGenres();

const { carouselItems } = useGenreCarousels({
    movieGenres: () => movieGenres.value?.genres,
});
</script>

<template>
    <div class="mt-2">
        <div v-if="isLoadingGenres" class="flex justify-center py-4">
            <span>Loading...</span>
        </div>
        <div v-else>
            <div v-for="item in carouselItems" :key="item.id">
                <WatchDiscoverMoviesCarousel
                    :sortBy="item.sortBy"
                    :genre="item.genre"
                    class="mt-4"
                />
            </div>
        </div>
    </div>
</template>

<style scoped></style>
