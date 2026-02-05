<script setup lang="ts">
import type Genre from "~/models/apiModels/watch/Genre";

definePageMeta({
    layout: "watch-layout",
    auth: false,
});

const first = ref<number>(0);
const currentPage = computed(() => {
    return Math.floor(first.value / 20) + 1;
});

const { data: movieGenres, isPending: isLoadingGenres } = useMovieGenres();
const selectedGenres = ref<Genre[]>([]);

const genreIds = computed(() => selectedGenres.value.map((el) => el.id));

const { data: exploreResults, isPending: isLoadingResults } = useDiscoverMovies(
    genreIds,
    'popularity.desc',
    currentPage
);

watch(selectedGenres, () => {
    first.value = 0;
});
</script>

<template>
    <div>
        <div v-if="isLoadingGenres" class="flex justify-center py-4">
            <span>Loading genres...</span>
        </div>
        <WatchGenreSelector :genres="movieGenres?.genres" v-else-if="movieGenres" v-model="selectedGenres"></WatchGenreSelector>
        <Paginator :rows="20" :total-records="Math.min(500, exploreResults?.total_pages || 0) * 20"
            v-model:first="first" class="w-fit"
            template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
            currentPageReportTemplate="Showing {first} to {last} of {totalRecords}"></Paginator>
        <div v-if="isLoadingResults" class="flex justify-center py-4">
            <span>Loading movies...</span>
        </div>
        <div v-else class="flex flex-row flex-wrap gap-4 mt-2">
            <div v-for="result in exploreResults?.results" :key="result.id">
                <WatchMovieIcon :movie="result"></WatchMovieIcon>
            </div>
        </div>
        <Paginator :rows="20" :total-records="Math.min(500, exploreResults?.total_pages || 0) * 20"
            v-model:first="first" class="w-fit"
            template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
            currentPageReportTemplate="Showing {first} to {last} of {totalRecords}"></Paginator>
    </div>
</template>

<style scoped></style>
