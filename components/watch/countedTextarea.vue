<script setup lang="ts">
/**
 * A text box that counts down the characters left to its `maxlength`, with
 * the form's buttons (the default slot) beside the count.
 */
const text = defineModel<string>({ required: true });
const props = defineProps<{
    id: string;
    maxlength: number;
    rows: number;
}>();

const charactersLeft = computed(() => props.maxlength - text.value.length);
</script>

<template>
    <Textarea :id="id" v-model="text" :maxlength="maxlength" :rows="rows" auto-resize class="w-full" />
    <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-muted-color" aria-live="polite">{{ charactersLeft }} characters left</span>
        <slot />
    </div>
</template>
