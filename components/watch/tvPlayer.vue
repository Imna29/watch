<script lang="ts" setup>
import type { TVShowDetails } from "~/models/apiModels/watch/TvModels";

const isOpen = defineModel({
    type: Boolean,
});

const props = defineProps<{
    tvData: TVShowDetails;
    seasonNumber?: number;
    episodeNumber?: number;
}>();

const router = useRouter();
const watchStore = useWatchStore();
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

const episodes = computedAsync(async () => {
    console.log("Fetching episodes");
    return (
        await watchStore.watchRepo.getSeasonData(
            id,
            Number(selectedSeason.value),
        )
    ).episodes;
}, []);

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

watch(
    [selectedEpisode, selectedSeason],
    async (newValue) => {
        if (loggedIn.value) {
            const historyPlaylist = (
                await watchStore.watchRepo.getAllPlaylists()
            ).filter((playlist) => playlist.type === "HISTORY")[0];
            watchStore.watchRepo.addToPlaylist(historyPlaylist.id, id, "TV_SHOW");
            watchStore.watchRepo.addWatchedEpisode(
                id,
                Number(selectedSeason.value),
                Number(selectedEpisode.value),
            );
        }
    },
    {
        immediate: true,
        deep: true,
    },
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
        <div class="w-dvw h-dvh bg-secondary z-10 fixed top-0 left-0">
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
