<script setup lang="ts">
import WatchAddToPlaylist from "~/components/watch/addToPlaylist.vue";
import { Star, ListPlus } from "lucide-vue-next";
import type LastWatched from "~/models/apiModels/watch/LastWatched";

definePageMeta({
    layout: "watch-layout",
    auth: false,
});

const id = Number(useRoute().params.id);
const watchStore = useWatchStore();
const { loggedIn } = useAuth();
const playerState = reactive({
    isOpen: false,
    seasonNumber: 1,
    episodeNumber: 1,
});

const { data: tvData, isPending, error } = useTvShow(id);
const { data: lastWatched } = useLastWatchedEpisode(id);

function openPlayer(seasonNumber = 1, episodeNumber = 1) {
    playerState.seasonNumber = seasonNumber;
    playerState.episodeNumber = episodeNumber;
    playerState.isOpen = true;
}

const trailers = computed(() => {
    return tvData.value?.videos?.results.filter(
        (video) =>
            video.type === "Trailer" &&
            video.site === "YouTube" &&
            video.official === true,
    );
});

const backgroundStyle = computed(() => ({
    backgroundImage: `url(${"https://image.tmdb.org/t/p/w1280/" + tvData?.value?.backdrop_path})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
}));

const dialog = useDialog();
function openAddToPlaylistDialog() {
    dialog.open(WatchAddToPlaylist, {
        props: {
            header: "Add to Playlist",
        },
        data: {
            contentId: id,
            contentType: "TV_SHOW",
        },
    });
}
</script>

<template>
    <div v-if="isPending" class="flex justify-center py-8">
        <span>Loading TV show...</span>
    </div>
    <div class="container" v-else-if="tvData">
        <WatchTvPlayer v-model="playerState.isOpen" :season-number="playerState.seasonNumber"
            :episode-number="playerState.episodeNumber" :tvData="tvData" v-if="playerState.isOpen && tvData"></WatchTvPlayer>
        <div class="relative left-1/2 right-1/2 !ml-[-50vw] !mr-[-50vw] !w-dvw !m-0 !p-0" :style="backgroundStyle">
            <div class="overlay absolute inset-0"></div>
            <div class="container m-auto h-[700px] relative flex items-center">
                <div class="w-full md:w-1/2">
                    <div class="flex gap-1 items-center">
                        <div class="flex gap-1 bg-gray-400/30 p-1 text-lg rounded-md">
                            <Star class="inline" />
                            {{ tvData.vote_average.toFixed(1) }}
                        </div>

                        {{ tvData.number_of_seasons }} Seasons |
                        {{ tvData.first_air_date }}
                    </div>
                    <div class="mt-2 flex gap-1">
                        <Badge v-for="genre in tvData.genres" variant="secondary">{{ genre.name }}
                        </Badge>
                    </div>
                    <div class="text-5xl mt-2">{{ tvData.name }}</div>
                    <div class="mt-4">{{ tvData.overview }}</div>
                    <div class="mt-4 flex gap-2 place-items-center">
                        <Button class="py-5 px-5 text-lg" @click="openPlayer()">{{
                            lastWatched?.lastEpisodeWatched ||
                                lastWatched?.recentEpisodeWatched
                                ? "Watch From Beginning"
                                : "Watch Now"
                        }}</Button>
                        <Button v-if="loggedIn" class="py-5 px-5 text-lg" severity="secondary" @click="
                            watchStore.saveForLater(
                                tvData.name,
                                tvData.id,
                                'TV_SHOW',
                            )
                            ">
                            Save for Later
                        </Button>
                        <Button v-if="loggedIn" class="p-1" severity="secondary" text outlined @click="openAddToPlaylistDialog()">
                            <ListPlus />
                        </Button>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div class="mt-2" v-if="
                            lastWatched &&
                            lastWatched.lastEpisodeWatched &&
                            lastWatched.recentEpisodeWatched &&
                            lastWatched.lastEpisodeWatched.episodeNum ===
                            lastWatched.recentEpisodeWatched
                                .episodeNum &&
                            lastWatched.lastEpisodeWatched.seasonNum ===
                            lastWatched.recentEpisodeWatched
                                .seasonNum
                        ">
                            <Button class="py-5 px-5 text-lg" @click="
                                openPlayer(
                                    lastWatched.lastEpisodeWatched
                                        .seasonNum,
                                    lastWatched.lastEpisodeWatched
                                        .episodeNum,
                                )
                                ">
                                Continue S{{
                                    lastWatched.lastEpisodeWatched.seasonNum
                                }}E{{
                                    lastWatched.lastEpisodeWatched.episodeNum
                                }}
                            </Button>
                        </div>
                        <div class="flex flex-col gap-2 mt-2" v-if="
                            lastWatched &&
                            lastWatched.lastEpisodeWatched &&
                            lastWatched.recentEpisodeWatched &&
                            (lastWatched.lastEpisodeWatched.episodeNum !==
                                lastWatched.recentEpisodeWatched
                                    .episodeNum ||
                                lastWatched.lastEpisodeWatched.seasonNum !==
                                lastWatched.recentEpisodeWatched
                                    .seasonNum)
                        ">
                            <span>Continue watching from the episode you watched
                                most recently</span>
                            <Button class="py-5 px-5 text-lg w-fit" @click="
                                openPlayer(
                                    lastWatched.recentEpisodeWatched
                                        .seasonNum,
                                    lastWatched.recentEpisodeWatched
                                        .episodeNum,
                                )
                                ">
                                S{{
                                    lastWatched.recentEpisodeWatched.seasonNum
                                }}E{{
                                    lastWatched.recentEpisodeWatched.episodeNum
                                }}
                            </Button>
                            <span>Continue watching from the furthest episode you
                                watched</span>
                            <Button class="py-5 px-5 text-lg w-fit" @click="
                                openPlayer(
                                    lastWatched?.lastEpisodeWatched
                                        .seasonNum,
                                    lastWatched.lastEpisodeWatched
                                        .episodeNum,
                                )
                                ">
                                S{{
                                    lastWatched.lastEpisodeWatched.seasonNum
                                }}E{{
                                    lastWatched.lastEpisodeWatched.episodeNum
                                }}
                            </Button>
                        </div>
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
                                    video.key
                                    " class="w-full md:w-4/5 h-full mt-2 mx-auto aspect-video" title="Embed videos and playlists"
                                    frameborder="0" allow="encrypted-media; picture-in-picture;"
                                    referrerpolicy="strict-origin-when-cross-origin" allowfullscreen
                                    lazy="true"></iframe>
                        </swiper-slide>
                    </swiper-container>
                </div>
            </div>
            <div v-if="tvData.similar && tvData.similar.results.length > 0">
                <div class="my-4 text-4xl text-center">Similar Shows</div>
                <WatchTvCarousel :tvShows="tvData.similar.results"></WatchTvCarousel>
            </div>
            <div v-if="
                tvData.recommendations &&
                tvData.recommendations.results.length > 0
            ">
                <div class="my-4 text-4xl text-center">Recommended Shows</div>
                <WatchTvCarousel :tvShows="tvData.recommendations.results"></WatchTvCarousel>
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
