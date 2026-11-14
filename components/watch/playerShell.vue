<script lang="ts" setup>
/**
 * The solo player for movies and TV episodes: the player frame
 * (`<WatchPlayerFrame>`) with the Source and episode pickers and "Watch
 * together". It records what plays in this Viewer's History, and closes
 * once this device takes part in a Watch Party, whose own player
 * (`<WatchPartyPlayer>`) opens instead.
 */
import { WatchPlaylistItemType, WatchPlaylistType } from "~/models/apiModels/watch/Playlist";
import { SOURCES, getSource, type Playable, type SourceId } from "~/utils/sources";

const props = defineProps<{
    contentType: WatchPlaylistItemType;
    tmdbId: number;
    /** The Title's name, shown to the other Viewer while this player is open. */
    title: string;
}>();

const season = defineModel<number>("season", { default: 1 });
const episode = defineModel<number>("episode", { default: 1 });
const sourceId = defineModel<SourceId>("source", { default: "vidlink" });

const emit = defineEmits<{
    close: [];
}>();

const playable = computed<Playable>(() =>
    props.contentType === WatchPlaylistItemType.MOVIE
        ? { kind: "movie", tmdbId: props.tmdbId }
        : { kind: "episode", tmdbId: props.tmdbId, season: season.value, episode: episode.value },
);

const iframeSrc = computed(() => getSource(sourceId.value).embedUrl(playable.value));
const sourceOptions = [...SOURCES];
const sourcePickerId = useId();

const titleRef = computed(() => ({ contentType: props.contentType, tmdbId: props.tmdbId, name: props.title }));
const playingEpisode = computed(() => {
    const now = playable.value;
    return now.kind === "episode" ? { season: now.season, episode: now.episode } : null;
});

// Joining or starting a Watch Party opens the Watch Party player instead
// (one that was minimized comes back: this device plays the Watch Party).
const watchParty = useWatchParty();
const partyPlayerMinimized = usePartyPlayerMinimized();
watch(() => watchParty.state.value.activeHere, (activeHere) => {
    if (!activeHere) return;
    partyPlayerMinimized.value = false;
    emit("close");
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
</script>

<template>
    <WatchPlayerFrame :content-type="contentType" :tmdb-id="tmdbId" :title="title" :src="iframeSrc"
        @close="emit('close')">
        <template #behind>
            <div class="absolute top-1/2 text-center w-full">
                Try another Source if it is taking too long to load.
            </div>
        </template>
        <template #controls>
            <WatchEpisodePicker v-if="contentType === WatchPlaylistItemType.TV_SHOW" v-model:season="season"
                v-model:episode="episode" :tmdb-id="tmdbId"></WatchEpisodePicker>
            <label :for="sourcePickerId" class="px-1">Source</label>
            <Select v-model="sourceId" :label-id="sourcePickerId" aria-label="Source" class="rounded p-2"
                :options="sourceOptions" option-value="id" option-label="name" append-to="self">
            </Select>
            <WatchTogetherButton :title="titleRef" :episode="playingEpisode" compact></WatchTogetherButton>
        </template>
    </WatchPlayerFrame>
</template>
