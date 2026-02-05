<script setup lang="ts">
const progress = ref<number>(0);
const isLoading = useIsLoading();
const interval = ref<NodeJS.Timeout | null>(null);
const cancelLoadingTimeout = ref<NodeJS.Timeout | null>(null);

watch(isLoading, (value) => {
  if (value) {
    progress.value = 0;
    interval.value = setInterval(() => {
      if (progress.value < 85) {
        progress.value += Math.floor(Math.random() * 6) + 5;
      }
    }, 300);
    cancelLoadingTimeout.value = setTimeout(() => {
      clearInterval(interval.value!);
      isLoading.value = false;
      handleFalse();
    }, 10000)
  } else {
    handleFalse();
  }
}, {immediate: true});


function handleFalse() {
  if (interval.value) clearInterval(interval.value);
  if (cancelLoadingTimeout.value) clearTimeout(cancelLoadingTimeout.value);
  progress.value = 100;
  setTimeout(() => {
    progress.value = 0;
  }, 500);
}
</script>

<template>
  <div class="fixed top-0 left-0 ease-in duration-300 h-1 bg-destructive w-0 z-30" :style="{ width: progress + '%' }"
       v-if="progress>0"></div>
</template>

<style scoped>

</style>