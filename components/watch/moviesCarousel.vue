<script lang="ts" setup>
import type { Movie } from '~/models/apiModels/watch/MovieModels';

const props = defineProps<{
    movies: Movie[];
}>();
</script>

<template>
  <div>
    <swiper-container
                :slides-per-view="'auto'"
                :space-between="30"
                :navigation="true"
                virtua="true"
            >
                <swiper-slide
                    v-for="(slideContent, index) in movies"
                    :key="index"
                    :virtualIndex="index"
                    class="md:!w-[15%] !w-1/2"
                >
                    <WatchMovieIcon :movie="slideContent"></WatchMovieIcon>
                </swiper-slide>
            </swiper-container>
  </div>
</template>
