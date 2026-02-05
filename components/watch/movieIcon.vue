<script setup lang="ts">
import type { Movie, MovieDetails } from "~/models/apiModels/watch/MovieModels";

const props = defineProps<{
    movie?: Movie;
    movieId?: number;
}>();

const watchStore = useWatchStore();

const movieRef = ref<Movie | MovieDetails | undefined>(props.movie);

onMounted(async () => {
    if (props.movieId) {
        movieRef.value = await watchStore.watchRepo.getMovieById(props.movieId);
    }
});
</script>

<template>
    <div class="relative overflow-hidden group" v-if="movieRef">
        <img
            :src="'https://image.tmdb.org/t/p/w300/' + movieRef.poster_path"
            :alt="movieRef.title"
            class="rounded-2xl w-full h-auto transition duration-300 ease-in-out"
        />
        <div
            class="absolute inset-0 bg-black/50 opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 ease-in-out flex pointer-events-none md:group-hover:pointer-events-auto"
        >
            <div class="m-auto flex flex-col gap-4 text-2xl">
                <NuxtLink :to="'/watch/movie/' + movieRef.id">
                    <Button class="text-lg p-5">Watch</Button>
                </NuxtLink>
                <Button class="text-lg p-5" severity="secondary">Details</Button>
            </div>
        </div>
        <div class="absolute top-2 right-2 md:hidden">
            <NuxtLink :to="'/watch/movie/' + movieRef.id">
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
