<script setup lang="ts">

</script>

<template>
  <div class="min-h-dvh grid grid-rows-12 background">
    <LazyIndexHeader class="w-fit mx-auto row-span-1"></LazyIndexHeader>
    <div class="row-span-11">
      <slot/>
    </div>
  </div>
</template>

<style scoped>
.background {
  background-image: url("/images/adam.svg");
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
}
</style>