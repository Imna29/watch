<script lang="ts" setup>
const isOpen = defineModel({
    type: Boolean,
});

const iframe = ref<HTMLIFrameElement>();
const selectedSource = ref<string>("0");
const id = Number(useRoute().params.id);
const watchStore = useWatchStore();

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

const iframeSrc = computed(() => {
    switch (selectedSource.value) {
        case "0":
            return `https://vidlink.pro/movie/${id}`;
        case "1":
            return `https://vidsrc.cc/v2/embed/movie/${id}}`;
        case "2":
            return `https://vidsrc.xyz/embed/movie/${id}`;
        case "3":
            return `https://multiembed.mov/directstream.php?video_id=${id}`;
        case "4":
            return `https://www.2embed.cc/embed/${id}`;
        case "5":
            return `https://moviesapi.club/movie/${id}`;
        default:
            return "";
    }
});

const { loggedIn } = useAuth();

if (loggedIn.value) {
    const historyPlaylist = (await watchStore.watchRepo.getAllPlaylists()).filter(
        (playlist) => playlist.type === "HISTORY",
    )[0];
    watchStore.watchRepo.addToPlaylist(historyPlaylist.id, id, "MOVIE");
}

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
        <div class="w-dvw h-dvh bg-secondary z-10 fixed top-0 left-0" v-if="isOpen">
            <div class="absolute top-0 left-0 w-dvw z-100">
                <div class="flex place-content-center gap-1 pt-2">
                    <Select v-model="selectedSource" :options="servers" class="rounded" default-value="0"
                        option-label="label" option-value="value">
                    </Select>
                    <Button @click="isOpen = false">
                        Close
                    </Button>
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
