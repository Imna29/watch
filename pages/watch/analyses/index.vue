<script lang="ts" setup>
// The list of Analyses (GLOSSARY.md, "Understanding"), for both Viewers: the
// average Grade, then every Analysis, ungraded first.
import { GRADE_MAX } from "~/models/apiModels/watch/Analysis";
import { ANALYSIS_WRITER, VIEWER_NAMES } from "~/models/Viewer";

definePageMeta({
    layout: "watch-layout",
});

const { data: viewer } = useViewer();
const { data: list, isPending, isError } = useAnalysisList();

const whoCanWrite = computed(() =>
    viewer.value === ANALYSIS_WRITER ? "You can" : `${VIEWER_NAMES[ANALYSIS_WRITER]} can`,
);
</script>

<template>
    <div class="mt-2">
        <h1 class="text-3xl">Analyses</h1>

        <div v-if="isPending" class="flex justify-center py-4">
            <span>Loading Analyses...</span>
        </div>
        <p v-else-if="isError" class="mt-4 text-muted-color">The Analyses could not be loaded. Please try again.</p>
        <template v-else-if="list">
            <p v-if="list.average !== null" class="mt-4">
                <span class="text-muted-color">Average Grade:</span>
                <strong class="text-4xl ml-2">{{ list.average.toFixed(1) }}</strong>
                <span class="text-muted-color"> / {{ GRADE_MAX }}</span>
            </p>

            <p v-if="list.analyses.length === 0" class="mt-4 text-muted-color">
                No Analyses yet. {{ whoCanWrite }} write one from any movie's page.
            </p>
            <ol v-else class="mt-8 flex flex-col gap-10">
                <li v-for="analysis in list.analyses" :key="analysis.movieId">
                    <WatchAnalysisListEntry :analysis="analysis" />
                </li>
            </ol>
        </template>
    </div>
</template>
