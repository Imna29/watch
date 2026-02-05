<script setup lang="ts">
definePageMeta({
  auth: false,
  layout: 'index-layout',
})
</script>

<template>
  <div class="grid grid-rows-12 h-full">
    <div class="row-span-8 flex font-mono">
      <div class="m-auto text-center ">
        <div class="md:text-9xl p-4 text-7xl drop nameContainer">
          IMNA Digital
        </div>
        <div class="md:text-2xl text-xl nameContainer">
          Experience Digital Revolution the IMNA way
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.nameContainer {
  text-shadow: 1px 1px 0 #000,
    -1px -1px 0 #000,
    -1px 1px 0 #000,
    1px -1px 0 #000;
  font-family: "Bebas Neue", monospace !important;
  letter-spacing: 0.1em;
}
</style>
