<script lang="ts" setup>
/**
 * The one player for movies and TV episodes: a full-viewport container with
 * the Source's iframe, the Source (and episode) pickers, and the site's own
 * fullscreen button.
 *
 * With `party-src`, it is the Watch Party player (`<WatchPartyPlayer>`): the
 * Watch Party decides the Source, the episode and the iframe URL, and the
 * server records History for both Viewers, so the pickers are hidden and
 * nothing is recorded here. Without it, it plays solo; it then offers
 * "Watch together", and closes once this device takes part in a Watch Party.
 *
 * Fullscreen applies to this container, never to the iframe, so anything
 * rendered inside it stays visible in fullscreen:
 * - the default slot is the overlay layer above the player (Watch Party
 *   messages, countdowns...). The layer lets clicks through to the player;
 *   an overlay that needs clicks sets `pointer-events-auto`. Overlays that
 *   live outside the player (the Call's tiles, `<WatchCall>`) teleport into
 *   the same layer through `usePlayerOverlayHost()`.
 * - the `controls` slot adds items to the control bar, before "Close".
 * Popups inside the shell must render inside it too (e.g. `append-to="self"`
 * on PrimeVue Selects): anything teleported to <body> is hidden in fullscreen.
 */
import { Maximize, Minimize } from "@lucide/vue";
import { WatchPlaylistItemType, WatchPlaylistType } from "~/models/apiModels/watch/Playlist";
import { SOURCES, getSource, type Playable, type SourceId } from "~/utils/sources";

const props = defineProps<{
    contentType: WatchPlaylistItemType;
    tmdbId: number;
    /** The Title's name, shown to the other Viewer while this player is open. */
    title: string;
    /** The Watch Party's iframe URL: set only for the Watch Party player. */
    partySrc?: string;
}>();

const season = defineModel<number>("season", { default: 1 });
const episode = defineModel<number>("episode", { default: 1 });
const sourceId = defineModel<SourceId>("source", { default: "vidlink" });

const emit = defineEmits<{
    close: [];
}>();

const inParty = props.partySrc !== undefined;

const playable = computed<Playable>(() =>
    props.contentType === WatchPlaylistItemType.MOVIE
        ? { kind: "movie", tmdbId: props.tmdbId }
        : { kind: "episode", tmdbId: props.tmdbId, season: season.value, episode: episode.value },
);

const iframeSrc = computed(() => props.partySrc ?? getSource(sourceId.value).embedUrl(playable.value));
const sourceOptions = [...SOURCES];

const shell = useTemplateRef<HTMLElement>("shell");
const iframe = useTemplateRef<HTMLIFrameElement>("iframe");
// Overlays from outside the player (the Call's tiles, from the app layout) teleport into this layer.
providePlayerOverlayHost(useTemplateRef<HTMLElement>("overlay"));
const sourcePickerId = useId();

const {
    isSupported: canFullscreen,
    isFullscreen,
    toggle: toggleFullscreen,
} = useFullscreen(shell, { autoExit: true });

const titleRef = computed(() => ({ contentType: props.contentType, tmdbId: props.tmdbId, name: props.title }));
useWatchingPresence(titleRef);

const watchParty = useWatchParty();

function watchTogether() {
    const now = playable.value;
    watchParty.start(titleRef.value, now.kind === "episode" ? { season: now.season, episode: now.episode } : null);
}

if (!inParty) {
    // Joining or starting a Watch Party opens the Watch Party player instead.
    watch(() => watchParty.state.value.activeHere, (activeHere) => {
        if (activeHere) emit("close");
    }, { immediate: true });

    const addToSystemPlaylist = useAddToSystemPlaylist();
    const { mutateAsync: addWatchedEpisode } = useAddWatchedEpisode();

    // Every movie or episode that starts playing goes into History; episodes also
    // into episode progress. Recording must never block or break playback.
    watch(
        playable,
        async (now) => {
            if (now.kind === "movie") {
                addToSystemPlaylist(WatchPlaylistType.HISTORY, now.tmdbId, WatchPlaylistItemType.MOVIE).catch((error) => {
                    console.error("Failed to record watch history", error);
                });
                return;
            }
            try {
                await Promise.all([
                    addToSystemPlaylist(WatchPlaylistType.HISTORY, now.tmdbId, WatchPlaylistItemType.TV_SHOW),
                    addWatchedEpisode({
                        tvId: now.tmdbId,
                        seasonNumber: now.season,
                        episodeNumber: now.episode,
                    }),
                ]);
            } catch (error) {
                console.error("Failed to record watch progress", error);
            }
        },
        { immediate: true },
    );
}

defineExpose({
    /** The current Source's iframe. It is replaced whenever the URL changes. */
    iframe,
});
</script>

<template>
    <Teleport to="body">
        <div ref="shell" class="w-dvw h-dvh bg-black z-10 fixed top-0 left-0">
            <div v-if="!inParty" class="absolute top-1/2 text-center w-full">
                Try another Source if it is taking too long to load.
            </div>

            <!--
                A new iframe per URL, so switching Source or episode adds no browser history entries.
                No fullscreen permission: only the shell goes fullscreen, so overlays stay visible.
            -->
            <iframe v-if="iframeSrc" ref="iframe" :key="iframeSrc" :src="iframeSrc"
                class="absolute top-0 left-0 w-full h-full" frameborder="0"
                allow="autoplay; encrypted-media; picture-in-picture"></iframe>

            <div ref="overlay" class="absolute inset-0 pointer-events-none">
                <slot></slot>
            </div>

            <div class="absolute top-0 right-2 flex flex-wrap place-content-end items-center gap-1 pt-2">
                <template v-if="!inParty">
                    <WatchEpisodePicker v-if="contentType === WatchPlaylistItemType.TV_SHOW" v-model:season="season"
                        v-model:episode="episode" :tmdb-id="tmdbId"></WatchEpisodePicker>
                    <label :for="sourcePickerId" class="px-1">Source</label>
                    <Select v-model="sourceId" :label-id="sourcePickerId" aria-label="Source" class="rounded p-2"
                        :options="sourceOptions" option-value="id" option-label="name" append-to="self">
                    </Select>
                    <Button class="rounded-full p-2" severity="secondary" :disabled="!watchParty.state.value.connected"
                        @click="watchTogether()">Watch together</Button>
                </template>
                <slot name="controls"></slot>
                <Button v-if="canFullscreen" class="rounded-full p-2" severity="secondary"
                    :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen()">
                    <Minimize v-if="isFullscreen" />
                    <Maximize v-else />
                </Button>
                <Button class="rounded-full p-2" @click="emit('close')">Close</Button>
            </div>
        </div>
    </Teleport>
</template>
