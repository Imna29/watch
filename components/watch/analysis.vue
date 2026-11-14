<script setup lang="ts">
/**
 * A movie page's Analysis section (GLOSSARY.md, "Understanding"). The writer
 * (`ANALYSIS_WRITER`) gets a box to write one while the movie has none; once
 * there is one, both Viewers read it. Until it is graded, the writer can edit
 * it (the same box, filled in) or delete it. The grader (`ANALYSIS_GRADER`)
 * sees nothing until then, and then grades it under the text, any number of
 * times; the writer sees her Grade and remark there.
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
const confirm = useConfirm();
const { data: viewer } = useViewer();
const { data: analysis, isSuccess } = useMovieAnalysis(() => props.movieId);
const { mutate: writeAnalysis, isPending: isWriting } = useWriteAnalysis();
const { mutate: deleteAnalysis, isPending: isDeleting } = useDeleteAnalysis();
const { mutate: gradeAnalysis, isPending: isGrading } = useGradeAnalysis();

const isWriter = computed(() => viewer.value === ANALYSIS_WRITER);
const isGrader = computed(() => viewer.value === ANALYSIS_GRADER);
const draft = ref("");

// The writer may edit or delete his Analysis until it is graded.
const canChange = computed(() => isWriter.value && analysis.value?.grade === null);
const isEditing = ref(false);
// The write box: for a new Analysis, or the writer's ungraded one while he edits it.
const showWriteBox = computed(
    () => isWriter.value && (!analysis.value || (isEditing.value && analysis.value.grade === null)),
);

function startEditing() {
    if (!analysis.value) return;
    draft.value = analysis.value.text;
    isEditing.value = true;
}

function stopEditing() {
    isEditing.value = false;
    draft.value = "";
}

/** A 409: the grader graded the Analysis first, so it is locked. */
function isAlreadyGraded(error: unknown) {
    return (error as { statusCode?: number }).statusCode === 409;
}

// The mutation refreshes the section after a refusal, so the graded Analysis shows.
function showAlreadyGraded() {
    stopEditing();
    toast.add({
        severity: "warn",
        summary: "Already graded",
        detail: `${VIEWER_NAMES[ANALYSIS_GRADER]} has already graded your Analysis, so it can no longer be changed.`,
        life: 5000,
    });
}

function confirmDelete() {
    confirm.require({
        message: "Delete your Analysis for good? This cannot be undone.",
        header: "Delete Analysis",
        icon: "pi pi-exclamation-triangle",
        acceptProps: { label: "Delete", severity: "danger" },
        rejectProps: { label: "Cancel", severity: "secondary" },
        accept: () => {
            deleteAnalysis(props.movieId, {
                onSuccess: () => {
                    toast.add({ severity: "success", summary: "Analysis deleted", life: 3000 });
                },
                onError: (error) => {
                    if (isAlreadyGraded(error)) return showAlreadyGraded();
                    console.error("Failed to delete the Analysis", error);
                    toast.add({
                        severity: "error",
                        summary: "Could not delete",
                        detail: "Your Analysis could not be deleted. Please try again.",
                        life: 4000,
                    });
                },
            });
        },
    });
}

const gradeDraft = ref<number | null>(null);
const remarkDraft = ref("");
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
                stopEditing();
            },
            onError: (error) => {
                if (isAlreadyGraded(error)) return showAlreadyGraded();
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
        <template v-if="analysis && !showWriteBox">
            <p class="whitespace-pre-wrap break-words">{{ analysis.text }}</p>

            <div v-if="canChange" class="mt-4 flex gap-2">
                <Button label="Edit" severity="secondary" outlined @click="startEditing" />
                <Button label="Delete" severity="danger" outlined :loading="isDeleting" @click="confirmDelete" />
            </div>

            <form v-if="isGrader" class="mt-6 flex flex-col gap-2" @submit.prevent="saveGrade">
                <span id="analysis-grade-label" class="text-muted-color">
                    Your Grade, from {{ GRADE_MIN }} to {{ GRADE_MAX }}
                </span>
                <SelectButton v-model="gradeDraft" :options="GRADES" :allow-empty="false"
                    aria-labelledby="analysis-grade-label" class="flex flex-wrap" />
                <label for="analysis-remark" class="text-muted-color mt-2">Remark (optional)</label>
                <WatchCountedTextarea id="analysis-remark" v-model="remarkDraft" :maxlength="GRADE_REMARK_MAX_LENGTH"
                    :rows="3">
                    <Button type="submit" label="Save" :loading="isGrading" :disabled="gradeDraft === null" />
                </WatchCountedTextarea>
            </form>

            <WatchAnalysisGrade v-else-if="analysis.grade !== null" :grade="analysis.grade" :remark="analysis.remark"
                class="mt-6" />
        </template>
        <form v-else class="flex flex-col gap-2" @submit.prevent="submit">
            <label for="analysis-text" class="text-muted-color">
                How did you understand this movie?
            </label>
            <WatchCountedTextarea id="analysis-text" v-model="draft" :maxlength="ANALYSIS_TEXT_MAX_LENGTH" :rows="8">
                <div class="flex gap-2">
                    <Button v-if="isEditing" label="Cancel" severity="secondary" text @click="stopEditing" />
                    <Button type="submit" :label="isEditing ? 'Save' : 'Submit'" :loading="isWriting"
                        :disabled="!draft.trim()" />
                </div>
            </WatchCountedTextarea>
        </form>
    </section>
</template>
