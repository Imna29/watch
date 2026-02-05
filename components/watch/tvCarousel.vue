<script lang="ts" setup>
import type { TVShow } from '~/models/apiModels/watch/TvModels';

const props = defineProps<{
    tvShows: TVShow[];
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
                    v-for="(slideContent, index) in tvShows"
                    :key="index"
                    :virtualIndex="index"
                    class="md:w-[15%]! w-1/2!"
                >
                    <WatchTvIcon :tv-show="slideContent"></WatchTvIcon>
                </swiper-slide>
            </swiper-container>
    </div>
</template>