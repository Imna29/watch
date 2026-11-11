<script lang="ts" setup>
import type { TVShowDetails } from "~/models/apiModels/watch/TvModels";
import { WatchPlaylistItemType, WatchPlaylistType } from "~/models/apiModels/watch/Playlist";

const isOpen = defineModel({
    type: Boolean,
});

const props = defineProps<{
    tvData: TVShowDetails;
    seasonNumber?: number;
    episodeNumber?: number;
}>();

const router = useRouter();
const { loggedIn } = useAuth();

const iframe = ref<HTMLIFrameElement>();
const selectedSource = ref<string>("0");
const selectedSeason = ref<number>(props.seasonNumber || 1);
const selectedEpisode = ref<number>(props.episodeNumber || 1);
const id = Number(useRoute().params.id);

const servers = [
    {
        label: "Server 1",
        value: "0",
    },
    {
        label: "Server 2",
        value: "1",
    },
    {
        label: "Server 3",
        value: "2",
    },
    {
        label: "Server 4",
        value: "3",
    },
    {
        label: "Server 5",
        value: "4",
    },
    {
        label: "Server 6",
        value: "5",
    },
];

const { data: seasonData } = useSeasonData(id, selectedSeason);
const episodes = computed(() => seasonData.value?.episodes ?? []);

const iframeSrc = asyncComputed(() => {
    switch (selectedSource.value) {
        case "0":
            return `https://vidlink.pro/tv/${id}/${selectedSeason.value}/${selectedEpisode.value}`;
        case "1":
            return `https://vidsrc.cc/v2/embed/tv/${id}/${selectedSeason.value}/${selectedEpisode.value}`;
        case "2":
            return `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${selectedSeason.value}&episode=${selectedEpisode.value}`;
        case "3":
            return `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${selectedSeason.value}&e=${selectedEpisode.value}`;
        case "4":
            return `https://www.2embed.cc/embedtv/${id}&s=${selectedSeason.value}&e=${selectedEpisode.value}`;
        case "5":
            return `https://moviesapi.club/tv/${id}-${selectedSeason.value}-${selectedEpisode.value}`;
        default:
            return "";
    }
}, "");

watch(selectedSeason, () => {
    selectedEpisode.value = 1;
});

const addToSystemPlaylist = useAddToSystemPlaylist();
const { mutateAsync: addWatchedEpisode } = useAddWatchedEpisode();

watch(
    [selectedEpisode, selectedSeason],
    async () => {
        if (!loggedIn.value) return;
        try {
            // Recording progress must never block or break playback.
            await Promise.all([
                addToSystemPlaylist(WatchPlaylistType.HISTORY, id, WatchPlaylistItemType.TV_SHOW),
                addWatchedEpisode({
                    tvId: id,
                    seasonNumber: Number(selectedSeason.value),
                    episodeNumber: Number(selectedEpisode.value),
                }),
            ]);
        } catch (error) {
            console.error("Failed to record watch progress", error);
        }
    },
    { immediate: true },
);

watch(
    iframeSrc,
    (value) => {
        iframe.value?.contentWindow!.location.replace(value);
    },
    {
        immediate: true,
    },
);

watch(iframe, () => {
    iframe.value?.contentWindow!.location.replace(iframeSrc.value);
});
</script>

<template>
    <Teleport to="body">
        <div class="w-dvw h-dvh bg-black z-10 fixed top-0 left-0">
            <div class="absolute top-0 w-fit right-2 z-100">
                <div class="flex place-content-center gap-1 pt-2">
                    <Select v-model="selectedSeason" class="rounded p-2" :options="tvData.seasons"
                        data-key="season_number" option-value="season_number" option-label="name">
                    </Select>
                    <Select v-model="selectedEpisode" class="rounded p-2" :options="episodes" v-if="episodes.length > 0"
                        option-value="episode_number" option-label="name">
                    </Select>
                    <Select v-model="selectedSource" class="rounded p-2" :options="servers" option-value="value"
                        option-label="label">
                    </Select>
                    <Button class="rounded-full p-2" @click="isOpen = false">Close</Button>
                </div>
            </div>
            <div class="absolute top-1/2 text-center w-dvw -z-10">
                Try other servers if it is taking too long to load.
            </div>

            <iframe ref="iframe" :src="iframeSrc" class="w-full h-full z-50" frameborder="0" allowfullscreen></iframe>
        </div>
    </Teleport>
</template>

<style scoped></style>
