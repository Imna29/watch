<script setup lang="ts">
import { useWindowScroll } from "@vueuse/core";

definePageMeta({
    layout: "watch-layout",
    keepalive: true,
    auth: false,
});

const { data: movieGenres, isPending: isLoadingMovieGenres } = useMovieGenres();
const { data: tvGenres, isPending: isLoadingTvGenres } = useTvGenres();

const usedMovieGenres = ref(new Set<number>());
const usedTvGenres = ref(new Set<number>());
const carouselItems = ref<any[]>([]);
const { y } = useWindowScroll();

const isLoading = computed(() => isLoadingMovieGenres.value || isLoadingTvGenres.value);

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

const getRandomUnusedTvGenre = computed(() =>
    getRandomUnusedGenre(tvGenres.value?.genres || [], usedTvGenres.value),
);

const addCarouselItem = () => {
    const isMovie = carouselItems.value.length % 2 === 0;
    const genre = isMovie
        ? getRandomUnusedMovieGenre.value
        : getRandomUnusedTvGenre.value;

    console.log(genre)

    if (!genre) return;

    const sortOptions = ["vote_average.desc", "popularity.desc"];
    const randomSort =
        sortOptions[Math.floor(Math.random() * sortOptions.length)];

    carouselItems.value.push({
        id: Date.now(),
        genre,
        sortBy: randomSort,
        isMovie,
    });

    if (isMovie) {
        usedMovieGenres.value.add(genre.id);
    } else {
        usedTvGenres.value.add(genre.id);
    }
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
        document.documentElement.scrollHeight - 98;
    if (bottomOfWindow) {
        loadMoreItems();
    }
}

watch(y, () => {
    checkForMoreItems();
}, {
    immediate: true
});

watch(movieGenres, async () => {
    for (let i = 0; i < 4; i++) {
        addCarouselItem();
        await nextTick();
}
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
