<script setup lang="ts">
/**
 * One entry on the list of Analyses (`pages/watch/analyses`): the movie's
 * poster and title, leading to its page, then the Analysis, its Grade or
 * "Not graded yet", and the remark.
 */
import { GRADE_MAX, type Analysis } from "~/models/apiModels/watch/Analysis";
import { ANALYSIS_GRADER, VIEWER_NAMES } from "~/models/Viewer";

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
            <p v-if="analysis.grade !== null">
                <span class="text-muted-color">{{ VIEWER_NAMES[ANALYSIS_GRADER] }}'s Grade:</span>
                <strong class="text-2xl ml-2">{{ analysis.grade }}</strong>
                <span class="text-muted-color"> / {{ GRADE_MAX }}</span>
            </p>
            <p v-else class="text-muted-color">Not graded yet</p>
            <p v-if="analysis.remark" class="whitespace-pre-wrap break-words">{{ analysis.remark }}</p>
        </div>
    </article>
</template>
