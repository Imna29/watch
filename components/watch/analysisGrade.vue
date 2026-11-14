<script setup lang="ts">
/** A graded Analysis's Grade, out of `GRADE_MAX`, and the remark given with it. */
import { GRADE_MAX } from "~/models/apiModels/watch/Analysis";
import { ANALYSIS_GRADER, VIEWER_NAMES } from "~/models/Viewer";

defineProps<{
    grade: number;
    remark: string | null;
}>();
</script>

<template>
    <div class="flex flex-col gap-2">
        <p>
            <span class="text-muted-color">{{ VIEWER_NAMES[ANALYSIS_GRADER] }}'s Grade:</span>
            <strong class="text-2xl ml-2">{{ grade }}</strong>
            <span class="text-muted-color"> / {{ GRADE_MAX }}</span>
        </p>
        <p v-if="remark" class="whitespace-pre-wrap break-words">{{ remark }}</p>
    </div>
</template>
