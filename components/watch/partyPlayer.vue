<script setup lang="ts">
/**
 * The Watch Party player: the player shell, run by party sync, on the one
 * device of this Viewer that takes part. The layout shows it on every page,
 * keyed on the Watch Party, while this device takes part.
 */
import { VIEWER_NAMES } from "~/models/Viewer";
import { getSource } from "~/utils/sources";

const watchParty = useWatchParty();
// Shown only while this device takes part, so there is a Watch Party.
const initial = watchParty.state.value.party!;
const party = computed(() => watchParty.state.value.party ?? initial);

const shell = useTemplateRef<{ iframe: HTMLIFrameElement | null }>("shell");
const iframe = computed(() => shell.value?.iframe);
const { src, view } = usePartySync(iframe);

const sourceName = computed(() => getSource(party.value.source).name);
</script>

<template>
    <WatchPlayerShell ref="shell" :content-type="party.title.contentType" :tmdb-id="party.title.tmdbId"
        :title="party.title.name" :season="party.episode?.season" :episode="party.episode?.episode" :party-src="src"
        @close="watchParty.cancel()">
        <div class="absolute inset-0 flex items-center justify-center" aria-live="polite">
            <div v-if="view.countdown !== null" class="text-9xl font-bold drop-shadow-lg">{{ view.countdown }}</div>
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
        <template #controls>
            <span class="px-2 text-muted-color">Watching together on {{ sourceName }}</span>
        </template>
    </WatchPlayerShell>
</template>
