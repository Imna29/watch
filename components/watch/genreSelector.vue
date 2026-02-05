<script setup lang="ts">
import { ChevronsUpDown, X } from "lucide-vue-next";
import type Genre from "~/models/apiModels/watch/Genre";

const props = defineProps<{
  modelValue: Genre[],
  genres: Genre[],
}>();


const model = defineModel({
  type: Array<Genre>,
  default: () => [],
});

</script>

<template>
  <div class="flex gap-2">
    <MultiSelect v-model="model" display="chip" :options="genres" optionLabel="name" filter
      placeholder="Select Genres" :maxSelectedLabels="3" class="w-full md:w-80" />

  </div>
</template>
<style scoped></style>