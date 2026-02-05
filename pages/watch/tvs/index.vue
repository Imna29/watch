<script setup lang="ts">
import { useWindowScroll } from "@vueuse/core";

definePageMeta({
    layout: "watch-layout",
    keepalive: true,
    auth: false,
});

const { data: tvGenres, isPending: isLoadingGenres } = useTvGenres();

const usedTvGenres = ref(new Set<number>());
const carouselItems = ref<any[]>([]);
const { y } = useWindowScroll();

const getRandomUnusedGenre = (genres: any[], usedGenres: Set<number>) => {
    if (!genres) return null;
    const availableGenres = genres.filter((genre) => !usedGenres.has(genre.id));
    if (availableGenres.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * availableGenres.length);
    return availableGenres[randomIndex];
};

const getRandomUnusedTvGenre = computed(() =>
    getRandomUnusedGenre(tvGenres.value?.genres || [], usedTvGenres.value),
);

const addCarouselItem = () => {
    const genre = getRandomUnusedTvGenre.value;

    if (!genre) return;

    const sortOptions = ["vote_average.desc", "popularity.desc"];
    const randomSort =
        sortOptions[Math.floor(Math.random() * sortOptions.length)];

    carouselItems.value.push({
        id: Date.now(),
        genre,
        sortBy: randomSort,
    });

    usedTvGenres.value.add(genre.id);
};

// Initial population


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


watch(tvGenres, async () => {
    for (let i = 0; i < 4; i++) {
    await nextTick();
    addCarouselItem();
}
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
