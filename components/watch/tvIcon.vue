<script setup lang="ts">
import type { TVShow, TVShowDetails } from "~/models/apiModels/watch/TvModels";

const props = defineProps<{
    tvShow?: TVShow;
    tvId?: number;
}>();

// Only fetch when the caller gave an id instead of a full object. Going
// through vue-query means the result is cached and shared with the detail page.
const { data: fetchedTv } = useTvShow(() => props.tvId ?? 0, {
    enabled: () => props.tvShow === undefined && props.tvId !== undefined,
});

const tvRef = computed<TVShow | TVShowDetails | undefined>(
    () => props.tvShow ?? fetchedTv.value,
);
</script>

<template>
    <div class="relative overflow-hidden group" v-if="tvRef">
        <img
            :src="'https://image.tmdb.org/t/p/w300/' + tvRef.poster_path"
            :alt="tvRef.name"
            class="rounded-2xl w-full h-auto transition duration-300 ease-in-out"
        />
        <div
            class="absolute inset-0 bg-black/50 opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 ease-in-out flex pointer-events-none md:group-hover:pointer-events-auto"
        >
            <div class="m-auto flex flex-col gap-4 text-2xl">
                <NuxtLink :to="'/watch/tv/' + tvRef.id">
                    <Button class="text-lg p-5">Watch</Button>
                </NuxtLink>
                <Button class="text-lg p-5" severity="secondary">Details</Button>
            </div>
        </div>
        <div class="absolute top-2 right-2 md:hidden">
            <NuxtLink :to="'/watch/tv/' + tvRef.id">
                <Button
                    icon="pi pi-play"
                    rounded
                    class="w-10 h-10"
                    aria-label="Watch"
                />
            </NuxtLink>
        </div>
    </div>
</template>

<style scoped></style>
