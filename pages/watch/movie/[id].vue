<script lang="ts" setup>
import WatchAddToPlaylist from "~/components/watch/addToPlaylist.vue";
import { Star, ListPlus } from "lucide-vue-next";

definePageMeta({
    layout: "watch-layout",
    auth: false,
});

const id = Number(useRoute().params.id);
const watchStore = useWatchStore();
const isPlayerOpen = ref<boolean>(false);
const { loggedIn } = useAuth();

const { data: movieData, isPending, error } = useMovie(id);

const trailers = computed(() => {
    return movieData.value?.videos?.results.filter(
        (video) =>
            video.type === "Trailer" &&
            video.site === "YouTube" &&
            video.official === true,
    );
});

const backgroundStyle = computed(() => ({
    backgroundImage: `url(${"https://image.tmdb.org/t/p/w1280/" + movieData?.value?.backdrop_path})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
}));

const formattedRuntime = computed(() => {
    if (!movieData.value?.runtime) {
        return "";
    }

    const hours = Math.floor(movieData.value.runtime / 60);
    const minutes = movieData.value.runtime % 60;
    return `${hours}h ${minutes}m`;
});

const dialog = useDialog();
function openAddToPlaylistDialog() {
    dialog.open(WatchAddToPlaylist, {
        props: {
            header: "Add to Playlist",
        },
        data: {
            contentId: id,
            contentType: "MOVIE",
        },
    });
}
</script>

<template>
    <div v-if="isPending" class="flex justify-center py-8">
        <span>Loading movie...</span>
    </div>
    <div class="container" v-else-if="movieData">
        <WatchMoviePlayer v-model="isPlayerOpen" v-if="isPlayerOpen"></WatchMoviePlayer>
        <div class="relative left-1/2 right-1/2 ml-[-50vw]! mr-[-50vw]! w-dvw! m-0! p-0!" :style="backgroundStyle">
            <div class="overlay absolute inset-0"></div>
            <div class="container m-auto h-[700px] relative flex items-center">
                <div class="w-full md:w-1/2">
                    <div class="flex gap-1 items-center">
                        <div class="flex gap-1 bg-gray-400/30 p-1 text-lg rounded-md">
                            <Star class="inline" />
                            {{ movieData.vote_average.toFixed(1) }}
                        </div>

                        {{ formattedRuntime }} |
                        {{ movieData.release_date }}
                    </div>
                    <div class="mt-2 flex gap-1">
                        <Badge v-for="genre in movieData.genres" variant="secondary">{{ genre.name }}
                        </Badge>
                    </div>
                    <div class="text-5xl mt-2">{{ movieData.title }}</div>
                    <div class="mt-4">{{ movieData.overview }}</div>
                    <div class="mt-4 flex gap-2 place-items-center">
                        <Button class="py-5 px-5 text-lg" @click="isPlayerOpen = !isPlayerOpen">Watch Now</Button>
                        <Button v-if="loggedIn" class="py-5 px-5 text-lg" severity="secondary" @click="
                            watchStore.saveForLater(
                                movieData.title,
                                id,
                                'MOVIE',
                            )
                            ">
                            Save for Later
                        </Button>
                        <Button v-if="loggedIn" class="p-1" severity="secondary" text outlined @click="openAddToPlaylistDialog()">
                            <ListPlus />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-1">
            <div v-if="trailers && trailers?.length > 0">
                <div class="my-4 text-4xl text-center">Trailers</div>
                <div>
                    <swiper-container navigation="true" virtual="true">
                        <swiper-slide v-for="video in trailers" lazy="true">
                            <iframe :src="'https://www.youtube.com/embed/' +
                                video.key" class="w-full md:w-4/5 h-full mt-2 mx-auto aspect-video"
                                title="Embed videos and playlists" frameborder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerpolicy="strict-origin-when-cross-origin" allowfullscreen lazy="true"></iframe>
                        </swiper-slide>
                    </swiper-container>
                </div>
            </div>
            <div v-if="movieData.similar && movieData.similar.results.length > 0">
                <div class="my-4 text-4xl text-center">Similar Movies</div>
                <WatchMoviesCarousel :movies="movieData.similar.results"></WatchMoviesCarousel>
            </div>
            <div v-if="
                movieData.recommendations &&
                movieData.recommendations.results.length > 0
            ">
                <div class="my-4 text-4xl text-center">Recommended Movies</div>
                <WatchMoviesCarousel :movies="movieData.recommendations.results"></WatchMoviesCarousel>
            </div>
        </div>
    </div>
</template>
<style>
.overlay {
    background: linear-gradient(to right,
            rgba(0, 0, 0, 0.85),
            rgba(0, 0, 0, 0.3),
            rgba(0, 0, 0, 0.85));
}
</style>
