<script setup lang="ts">
/**
 * The Watch Party player: the player shell, run by party sync, on the one
 * device of this Viewer that takes part. The layout shows it on every page,
 * keyed on the Watch Party, while this device takes part.
 */
import { VIEWER_NAMES } from "~/models/Viewer";
import { describeChange } from "~/realtime/watchParty/changeMessage";
import { WATCH_PARTY_SOURCES } from "~/realtime/watchParty/sources";
import { getSource, type SourceId } from "~/utils/sources";

const watchParty = useWatchParty();
// Shown only while this device takes part, so there is a Watch Party.
const initial = watchParty.state.value.party!;
const party = computed(() => watchParty.state.value.party ?? initial);

const shell = useTemplateRef<{ iframe: HTMLIFrameElement | null }>("shell");
const iframe = computed(() => shell.value?.iframe);
const { src, view } = usePartySync(iframe);

const sourceName = computed(() => getSource(party.value.source).name);

// The episode picker follows the Watch Party; choosing another episode there moves both Viewers to it.
const chosen = reactive({ season: initial.episode?.season ?? 1, episode: initial.episode?.episode ?? 1 });
watch(() => party.value.episode, (episode) => {
    if (episode) Object.assign(chosen, episode);
});
watch(() => [chosen.season, chosen.episode] as const, ([season, episode]) => {
    watchParty.changeEpisode({ season, episode });
});

// Source fallback: once the Source fails on either device, both Viewers are offered the next Syncable
// Source; once none is left, Tab Share. The Source picker switches both players at any time.
const failedNames = computed(() => party.value.failedSources.map((id) => getSource(id).name).join(" and "));
const offeredSource = computed(() => (party.value.fallback?.kind === "source" ? party.value.fallback.source : null));
const sourceOptions = WATCH_PARTY_SOURCES.map((id) => getSource(id));
const sourcePickerId = useId();
const chosenSource = ref<SourceId>(initial.source);
watch(() => party.value.source, (source) => {
    chosenSource.value = source;
});
watch(chosenSource, (source) => {
    watchParty.switchSource(source);
});
</script>

<template>
    <WatchPlayerShell ref="shell" :content-type="party.title.contentType" :tmdb-id="party.title.tmdbId"
        :title="party.title.name" :season="party.episode?.season" :episode="party.episode?.episode" :party-src="src"
        @close="watchParty.cancel()">
        <div class="absolute inset-0 flex items-center justify-center" aria-live="polite">
            <div v-if="view.countdown !== null" class="text-9xl font-bold drop-shadow-lg">{{ view.countdown }}</div>
            <div v-else-if="party.fallback"
                class="pointer-events-auto flex flex-col items-center gap-3 rounded-lg bg-black/80 px-6 py-4 text-center">
                <span class="text-xl">{{ failedNames }} couldn't play {{ party.title.name }}.</span>
                <Button v-if="offeredSource" @click="watchParty.switchSource(offeredSource)">
                    Try {{ getSource(offeredSource).name }}
                </Button>
                <!-- No Syncable Source is left (fallback "tab-share"): Tab Share is offered here. -->
            </div>
            <div v-else-if="view.player === 'failed'"
                class="pointer-events-auto rounded-lg bg-black/80 px-6 py-4 text-center">
                {{ sourceName }} couldn't play this Title.
            </div>
            <div v-else-if="view.waitingFor"
                class="pointer-events-auto flex flex-col items-center gap-3 rounded-lg bg-black/80 px-6 py-4">
                <span class="text-xl">Waiting for {{ VIEWER_NAMES[view.waitingFor] }}…</span>
                <Button severity="secondary" @click="watchParty.cancel()">Cancel</Button>
            </div>
            <div v-else-if="view.gettingReady" class="rounded-lg bg-black/80 px-6 py-4 text-xl">Getting ready…</div>
            <div v-else-if="view.player === 'loading'" class="text-center">Loading {{ sourceName }}…</div>
        </div>
        <!-- "Mariam paused at 1:02:14": the other Viewer's change, for a few seconds. -->
        <div class="absolute top-16 left-1/2 -translate-x-1/2" aria-live="polite">
            <div v-if="view.lastChange" class="rounded-lg bg-black/80 px-4 py-2 whitespace-nowrap">
                {{ describeChange(view.lastChange) }}
            </div>
        </div>
        <template #controls>
            <WatchEpisodePicker v-if="party.episode" v-model:season="chosen.season" v-model:episode="chosen.episode"
                :tmdb-id="party.title.tmdbId"></WatchEpisodePicker>
            <label :for="sourcePickerId" class="px-1">Watching together on</label>
            <Select v-model="chosenSource" :label-id="sourcePickerId" aria-label="Source" class="rounded p-2"
                :options="sourceOptions" option-value="id" option-label="name" append-to="self">
            </Select>
        </template>
    </WatchPlayerShell>
</template>
