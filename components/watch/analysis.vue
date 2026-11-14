<script setup lang="ts">
/**
 * A movie page's Analysis section (GLOSSARY.md, "Understanding"). The writer
 * (`ANALYSIS_WRITER`) gets a box to write one while the movie has none; once
 * there is one, both Viewers read it. The grader sees nothing until then.
 */
import { ANALYSIS_TEXT_MAX_LENGTH } from "~/models/apiModels/watch/Analysis";
import { ANALYSIS_WRITER, VIEWER_NAMES } from "~/models/Viewer";

const props = defineProps<{
    movieId: number;
}>();

const toast = useToast();
const { data: viewer } = useViewer();
const { data: analysis, isSuccess } = useMovieAnalysis(() => props.movieId);
const { mutate: writeAnalysis, isPending: isWriting } = useWriteAnalysis();

const isWriter = computed(() => viewer.value === ANALYSIS_WRITER);
const draft = ref("");
const charactersLeft = computed(() => ANALYSIS_TEXT_MAX_LENGTH - draft.value.length);

function submit() {
    if (!draft.value.trim()) return;
    writeAnalysis(
        { movieId: props.movieId, text: draft.value },
        {
            onSuccess: () => {
                draft.value = "";
            },
            onError: (error) => {
                console.error("Failed to submit the Analysis", error);
                toast.add({
                    severity: "error",
                    summary: "Could not submit",
                    detail: "Your Analysis could not be submitted. Please try again.",
                    life: 4000,
                });
            },
        },
    );
}
</script>

<template>
    <section v-if="isSuccess && (analysis || isWriter)" class="my-8">
        <h2 class="text-3xl mb-4">
            {{ isWriter ? "Your Analysis" : `${VIEWER_NAMES[ANALYSIS_WRITER]}'s Analysis` }}
        </h2>
        <p v-if="analysis" class="whitespace-pre-wrap break-words">{{ analysis.text }}</p>
        <form v-else class="flex flex-col gap-2" @submit.prevent="submit">
            <label for="analysis-text" class="text-muted-color">
                How did you understand this movie?
            </label>
            <Textarea id="analysis-text" v-model="draft" :maxlength="ANALYSIS_TEXT_MAX_LENGTH" rows="8"
                auto-resize class="w-full" />
            <div class="flex items-center justify-between gap-2">
                <span class="text-sm text-muted-color" aria-live="polite">
                    {{ charactersLeft }} characters left
                </span>
                <Button type="submit" label="Submit" :loading="isWriting" :disabled="!draft.trim()" />
            </div>
        </form>
    </section>
</template>
