<script setup lang="ts">
import { useWindowScroll } from "@vueuse/core";

definePageMeta({
    layout: "watch-layout",
    keepalive: true,
    auth: false,
});

const { data: movieGenres, isPending: isLoadingMovieGenres } = useMovieGenres();
const { data: tvGenres, isPending: isLoadingTvGenres } = useTvGenres();

const usedMovieGenres = ref<Set<number>>(new Set());
const usedTvGenres = ref<Set<number>>(new Set());
const carouselItems = ref<any[]>([]);
const { y } = useWindowScroll();

// Prevent concurrent initialization
const isInitializing = ref(false);
const hasInitialized = ref(false);

const isLoading = computed(() => isLoadingMovieGenres.value || isLoadingTvGenres.value);

const getRandomUnusedGenre = (genres: any[], usedGenres: Set<number>) => {
    if (!genres?.length) return null;
    const availableGenres = genres.filter((genre) => !usedGenres.has(genre.id));
    if (availableGenres.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * availableGenres.length);
    return availableGenres[randomIndex];
};

const addCarouselItem = async () => {
    // Don't proceed if genres aren't ready
    if (!movieGenres.value?.genres || !tvGenres.value?.genres) return;

    const isMovie = carouselItems.value.length % 2 === 0;
    const genres = isMovie ? movieGenres.value.genres : tvGenres.value.genres;
    const usedSet = isMovie ? usedMovieGenres.value : usedTvGenres.value;

    const genre = getRandomUnusedGenre(genres, usedSet);

    if (!genre) {
        // If this type is exhausted, try the other type
        const fallbackIsMovie = !isMovie;
        const fallbackGenres = fallbackIsMovie ? movieGenres.value.genres : tvGenres.value.genres;
        const fallbackUsed = fallbackIsMovie ? usedMovieGenres.value : usedTvGenres.value;
        const fallbackGenre = getRandomUnusedGenre(fallbackGenres, fallbackUsed);

        if (!fallbackGenre) return; // Both exhausted

        // Add fallback item instead
        const sortOptions = ["vote_average.desc", "popularity.desc"];
        const randomSort = sortOptions[Math.floor(Math.random() * sortOptions.length)];

        carouselItems.value.push({
            id: Date.now() + Math.random(), // Ensure unique ID
            genre: fallbackGenre,
            sortBy: randomSort,
            isMovie: fallbackIsMovie,
        });

        if (fallbackIsMovie) {
            usedMovieGenres.value.add(fallbackGenre.id);
        } else {
            usedTvGenres.value.add(fallbackGenre.id);
        }
        return;
    }

    const sortOptions = ["vote_average.desc", "popularity.desc"];
    const randomSort = sortOptions[Math.floor(Math.random() * sortOptions.length)];

    carouselItems.value.push({
        id: Date.now() + Math.random(),
        genre,
        sortBy: randomSort,
        isMovie,
    });

    if (isMovie) {
        usedMovieGenres.value.add(genre.id);
    } else {
        usedTvGenres.value.add(genre.id);
    }

    await nextTick();
};

const loadMoreItems = async (count: number = 2) => {
    for (let i = 0; i < count; i++) {
        await addCarouselItem();
    }
};

const initializeCarousels = async () => {
    if (hasInitialized.value || isInitializing.value || isLoading.value) return;
    isInitializing.value = true;

    // Wait for both genre sets to be available
    if (!movieGenres.value?.genres || !tvGenres.value?.genres) {
        isInitializing.value = false;
        return;
    }

    await loadMoreItems(4);
    hasInitialized.value = true;
    isInitializing.value = false;
};

const checkForMoreItems = () => {
    if (!hasInitialized.value || isInitializing.value) return;

    const bottomOfWindow = window.innerHeight + y.value >= document.documentElement.scrollHeight - 98;
    if (bottomOfWindow) {
        loadMoreItems(2);
    }
};

// Single initialization watcher
watch(
    [movieGenres, tvGenres],
    () => {
        if (movieGenres.value?.genres && tvGenres.value?.genres) {
            initializeCarousels();
        }
    },
    { immediate: true }
);

// Scroll watcher (no immediate - let initialization handle first load)
watch(y, () => {
    nextTick().then(() => {
        checkForMoreItems();
    });
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
