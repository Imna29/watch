<script setup lang="ts">
definePageMeta({
    layout: "watch-layout",
    keepalive: true,
    auth: false,
});

const { data: tvGenres, isPending: isLoadingGenres } = useTvGenres();

const { carouselItems } = useGenreCarousels({
    tvGenres: () => tvGenres.value?.genres,
});
</script>

<template>
    <div class="mt-2">
        <div v-if="isLoadingGenres" class="flex justify-center py-4">
            <span>Loading...</span>
        </div>
        <div v-else>
            <div v-for="item in carouselItems" :key="item.id">
                <WatchDiscoverTvCarousel
                    :sortBy="item.sortBy"
                    :genre="item.genre"
                    class="mt-4"
                />
            </div>
        </div>
    </div>
</template>

<style scoped></style>
