<script setup lang="ts">
/**
 * A movie page's Analysis section (GLOSSARY.md, "Understanding"). The writer
 * (`ANALYSIS_WRITER`) gets a box to write one while the movie has none; once
 * there is one, both Viewers read it. The grader (`ANALYSIS_GRADER`) sees
 * nothing until then, and then grades it under the text, any number of times;
 * the writer sees her Grade and remark there.
 */
import {
    ANALYSIS_TEXT_MAX_LENGTH,
    GRADE_MAX,
    GRADE_MIN,
    GRADE_REMARK_MAX_LENGTH,
} from "~/models/apiModels/watch/Analysis";
import { ANALYSIS_GRADER, ANALYSIS_WRITER, VIEWER_NAMES } from "~/models/Viewer";

const props = defineProps<{
    movieId: number;
}>();

const GRADES = Array.from({ length: GRADE_MAX - GRADE_MIN + 1 }, (_, index) => GRADE_MIN + index);

const toast = useToast();
const { data: viewer } = useViewer();
const { data: analysis, isSuccess } = useMovieAnalysis(() => props.movieId);
const { mutate: writeAnalysis, isPending: isWriting } = useWriteAnalysis();
const { mutate: gradeAnalysis, isPending: isGrading } = useGradeAnalysis();

const isWriter = computed(() => viewer.value === ANALYSIS_WRITER);
const isGrader = computed(() => viewer.value === ANALYSIS_GRADER);
const draft = ref("");
const charactersLeft = computed(() => ANALYSIS_TEXT_MAX_LENGTH - draft.value.length);

const gradeDraft = ref<number | null>(null);
const remarkDraft = ref("");
const remarkCharactersLeft = computed(() => GRADE_REMARK_MAX_LENGTH - remarkDraft.value.length);
// The grader's form starts from the Grade as stored, and follows it when it changes.
watch(
    analysis,
    (current) => {
        gradeDraft.value = current?.grade ?? null;
        remarkDraft.value = current?.remark ?? "";
    },
    { immediate: true },
);

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

function saveGrade() {
    if (gradeDraft.value === null) return;
    gradeAnalysis(
        { movieId: props.movieId, grade: gradeDraft.value, remark: remarkDraft.value.trim() || null },
        {
            onSuccess: () => {
                toast.add({ severity: "success", summary: "Grade saved", life: 3000 });
            },
            onError: (error) => {
                console.error("Failed to save the Grade", error);
                toast.add({
                    severity: "error",
                    summary: "Could not save",
                    detail: "Your Grade could not be saved. Please try again.",
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
        <template v-if="analysis">
            <p class="whitespace-pre-wrap break-words">{{ analysis.text }}</p>

            <form v-if="isGrader" class="mt-6 flex flex-col gap-2" @submit.prevent="saveGrade">
                <span id="analysis-grade-label" class="text-muted-color">
                    Your Grade, from {{ GRADE_MIN }} to {{ GRADE_MAX }}
                </span>
                <SelectButton v-model="gradeDraft" :options="GRADES" :allow-empty="false"
                    aria-labelledby="analysis-grade-label" class="flex flex-wrap" />
                <label for="analysis-remark" class="text-muted-color mt-2">Remark (optional)</label>
                <Textarea id="analysis-remark" v-model="remarkDraft" :maxlength="GRADE_REMARK_MAX_LENGTH" rows="3"
                    auto-resize class="w-full" />
                <div class="flex items-center justify-between gap-2">
                    <span class="text-sm text-muted-color" aria-live="polite">
                        {{ remarkCharactersLeft }} characters left
                    </span>
                    <Button type="submit" label="Save" :loading="isGrading" :disabled="gradeDraft === null" />
                </div>
            </form>

            <div v-else-if="analysis.grade !== null" class="mt-6 flex flex-col gap-2">
                <p>
                    <span class="text-muted-color">{{ VIEWER_NAMES[ANALYSIS_GRADER] }}'s Grade:</span>
                    <strong class="text-2xl ml-2">{{ analysis.grade }}</strong>
                    <span class="text-muted-color"> / {{ GRADE_MAX }}</span>
                </p>
                <p v-if="analysis.remark" class="whitespace-pre-wrap break-words">{{ analysis.remark }}</p>
            </div>
        </template>
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
