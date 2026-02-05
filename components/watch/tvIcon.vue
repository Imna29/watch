<script setup lang="ts">
import type { TVShow, TVShowDetails } from "~/models/apiModels/watch/TvModels";

const props = defineProps<{
    tvShow?: TVShow;
    tvId?: number;
}>();

const watchStore = useWatchStore();

const tvRef = ref<TVShow | TVShowDetails | undefined>(
    props.tvShow || undefined,
);

onMounted(async () => {
    if (props.tvId) {
        tvRef.value = await watchStore.watchRepo.getTvById(props.tvId);
    }
});
</script>

<template>
    <div class="relative overflow-hidden group" v-if="tvRef">
        <img
            :src="'https://image.tmdb.org/t/p/w300/' + tvRef.poster_path"
            :alt="tvRef.name"
            class="rounded-2xl w-full h-auto transition duration-300 ease-in-out"
        />
        <div
            class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out flex pointer-events-none group-hover:pointer-events-auto"
        >
            <div class="m-auto flex flex-col gap-4 text-2xl">
                <NuxtLink :to="'/watch/tv/' + tvRef.id">
                    <Button class="text-lg p-5">Watch</Button>
                </NuxtLink>
                <Button class="text-lg p-5" severity="secondary">Details</Button>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
