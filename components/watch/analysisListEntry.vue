<script setup lang="ts">
/**
 * One entry on the list of Analyses (`pages/watch/analyses`): the movie's
 * poster and title, leading to its page, then the Analysis, its Grade or
 * "Not graded yet", and the remark.
 */
import type { Analysis } from "~/models/apiModels/watch/Analysis";

const props = defineProps<{
    analysis: Analysis;
}>();

// Same query as the poster's, so the title costs no extra request.
const { data: movie } = useMovie(() => props.analysis.movieId);
const moviePage = computed(() => `/watch/movie/${props.analysis.movieId}`);
const title = computed(() => movie.value?.title ?? `Movie ${props.analysis.movieId}`);
</script>

<template>
    <article class="flex gap-4 md:gap-6">
        <WatchMovieIcon class="md:w-[150px] w-[100px] shrink-0 self-start" :movie-id="analysis.movieId" />
        <div class="flex flex-col gap-3 min-w-0">
            <NuxtLink :to="moviePage" class="text-2xl hover:underline">{{ title }}</NuxtLink>
            <p class="whitespace-pre-wrap break-words">{{ analysis.text }}</p>
            <WatchAnalysisGrade v-if="analysis.grade !== null" :grade="analysis.grade" :remark="analysis.remark" />
            <p v-else class="text-muted-color">Not graded yet</p>
        </div>
    </article>
</template>
