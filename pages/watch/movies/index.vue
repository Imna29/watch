<script setup lang="ts">
import { useWindowScroll } from "@vueuse/core";

definePageMeta({
    layout: "watch-layout",
    keepalive: true,
    auth: false,
});

const { data: movieGenres, isPending: isLoadingGenres } = useMovieGenres();

const usedMovieGenres = ref(new Set<number>());
const carouselItems = ref<any[]>([]);
const { y } = useWindowScroll();

const getRandomUnusedGenre = (genres: any[], usedGenres: Set<number>) => {
    if (!genres) return null;
    const availableGenres = genres.filter((genre) => !usedGenres.has(genre.id));
    if (availableGenres.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * availableGenres.length);
    return availableGenres[randomIndex];
};

const getRandomUnusedMovieGenre = computed(() =>
    getRandomUnusedGenre(movieGenres.value?.genres || [], usedMovieGenres.value),
);

const addCarouselItem = () => {
    const genre = getRandomUnusedMovieGenre.value;

    if (!genre) return;

    const sortOptions = ["vote_average.desc", "popularity.desc"];
    const randomSort =
        sortOptions[Math.floor(Math.random() * sortOptions.length)];

    carouselItems.value.push({
        id: Date.now(),
        genre,
        sortBy: randomSort,
    });
    usedMovieGenres.value.add(genre.id);
};

// Initial population
for (let i = 0; i < 4; i++) {
    addCarouselItem();
}

function loadMoreItems() {
    for (let i = 0; i < 2; i++) {
        addCarouselItem();
    }
}

function checkForMoreItems() {
    const bottomOfWindow =
        window.innerHeight + y.value >=
        document.documentElement.scrollHeight - 100;
    if (bottomOfWindow) {
        loadMoreItems();
    }
}

watch(y, () => {
    checkForMoreItems();
}, {
    immediate: true
});

watch(movieGenres, () => {
    addCarouselItem();
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
