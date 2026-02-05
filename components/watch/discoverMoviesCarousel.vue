<script setup lang="ts">
import type Genre from "~/models/apiModels/watch/Genre";

const props = defineProps<{
    genre?: Genre;
    sortBy: "popularity.desc" | "vote_average.desc";
}>();

const genreIds = computed(() => props.genre ? [props.genre.id] : []);
const page = ref(1);

const { data: moviesData, isPending, error } = useDiscoverMovies(
    genreIds,
    () => props.sortBy,
    page
);
</script>

<template>
    <div>
        <div class="text-3xl font-black">
            {{ sortBy === "popularity.desc" ? "Popular" : "Top Rated" }}
            {{ genre?.name }} Movies
        </div>
        <div v-if="isPending" class="flex justify-center py-4">
            <span>Loading...</span>
        </div>
        <div v-else class="mt-2">
            <swiper-container :slides-per-view="'auto'" :space-between="30" :navigation="true" virtua="true">
                <swiper-slide v-for="(slideContent, index) in moviesData?.results" :key="index" :virtualIndex="index"
                    class="md:!w-[15%] !w-1/2">
                    <WatchMovieIcon :movie="slideContent"></WatchMovieIcon>
                </swiper-slide>
            </swiper-container>
        </div>
    </div>
</template>

<style scoped></style>
