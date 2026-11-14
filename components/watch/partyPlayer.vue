<script setup lang="ts">
/**
 * The Watch Party player: the player shell, run by party sync, on the one
 * device of this Viewer that takes part. The layout shows it on every page,
 * keyed on the Watch Party, while this device takes part, and after the
 * other Viewer left it: then it asks "Keep watching alone / Stop", and plays
 * on unsynced, for this Viewer alone. In Tab Share it plays the Source the
 * sharer shares, or shows the shared tab (`<WatchTabShareView>`).
 */
import { otherViewer, VIEWER_NAMES } from "~/models/Viewer";
import type { MediaProblem } from "~/realtime/call/device";
import { describeChange } from "~/realtime/watchParty/changeMessage";
import { playableOf } from "~/realtime/watchParty/partySync";
import { WATCH_PARTY_SOURCES } from "~/realtime/watchParty/sources";
import { getSource, SOURCES, type SourceId } from "~/utils/sources";

const watchParty = useWatchParty();
// Shown only for a Watch Party (`playerParty`), which stays this player's.
const initial = watchParty.state.value.playerParty!;
const party = computed(() => watchParty.state.value.playerParty ?? initial);
/** The other Viewer left: this Viewer watches on alone (or is being asked whether to). */
const alone = computed(() => party.value.phase.name === "ended");

// Closing the player leaves the Watch Party, and the other Viewer is asked what to do; once alone, it just closes.
function close() {
    if (alone.value) watchParty.stop();
    else watchParty.leave();
}

// Tab Share: the sharer plays any Source here and shares this tab over the Call, and the other Viewer
// watches it (`<WatchTabShareView>`). No Syncable Source plays meanwhile, so party sync does not run.
const tabShare = useTabShare();
const inTabShare = computed(() => party.value.mode === "tab-share");
const sharingHere = computed(() => !!party.value.tabShare && party.value.tabShare.sharer === watchParty.state.value.viewer);
const otherName = computed(() => {
    const viewer = watchParty.state.value.viewer;
    return viewer ? VIEWER_NAMES[otherViewer(viewer)] : "the other Viewer";
});
const tabShareSources = [...SOURCES];
const tabShareSourceId = useId();
const tabShareSource = ref<SourceId>(initial.tabShare?.source ?? firstTabShareSource(initial));
watch(() => party.value.tabShare?.source, (source) => {
    if (source) tabShareSource.value = source;
});
watch(tabShareSource, (source) => {
    tabShare.changeSource(source);
});

const shell = useTemplateRef<{ iframe: HTMLIFrameElement | null }>("shell");
const iframe = computed(() => shell.value?.iframe);
const { src, view } = usePartySync(iframe, () => !inTabShare.value);
/** The iframe's URL: the Syncable Source, or in Tab Share the sharer's Source (none for the other Viewer). */
const shellSrc = computed(() => {
    const share = party.value.tabShare;
    if (!inTabShare.value || !share) return src.value;
    return sharingHere.value ? getSource(share.source).embedUrl(playableOf(party.value)) : "";
});

// "Your tab couldn't be shared": why the Viewer's last try to share failed, for a while.
const tabShareProblem = ref<MediaProblem | null>(null);
let tabShareProblemTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => tabShare.state.value, (now, before) => {
    if (!before?.starting || now.starting || !now.problem) return;
    tabShareProblem.value = now.problem;
    clearTimeout(tabShareProblemTimer);
    tabShareProblemTimer = setTimeout(() => (tabShareProblem.value = null), 10_000);
});
onBeforeUnmount(() => clearTimeout(tabShareProblemTimer));

function tabShareProblemMessage(problem: MediaProblem) {
    switch (problem) {
        case "unsupported":
            return "This browser can't share a tab. Use Chrome or Edge on a computer.";
        case "blocked":
            return "No tab was shared. To share, choose this tab in the browser's dialog.";
        default:
            return "Your tab couldn't be shared. Try again.";
    }
}

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
        :title="party.title.name" :season="party.episode?.season" :episode="party.episode?.episode"
        :party-src="shellSrc" @close="close()">
        <div class="absolute inset-0 flex items-center justify-center" aria-live="polite">
            <div v-if="watchParty.state.value.left"
                class="pointer-events-auto flex flex-col items-center gap-3 rounded-lg bg-black/80 px-6 py-4">
                <span class="text-xl">{{ VIEWER_NAMES[watchParty.state.value.left.by] }} left</span>
                <div class="flex gap-2">
                    <!-- After a Tab Share, only the sharer has something to watch on. -->
                    <Button v-if="!inTabShare || sharingHere" @click="watchParty.keepWatchingAlone()">
                        Keep watching alone
                    </Button>
                    <Button severity="secondary" @click="watchParty.stop()">Stop</Button>
                </div>
            </div>
            <WatchTabShareView v-else-if="inTabShare" :party="party"></WatchTabShareView>
            <div v-else-if="view.countdown !== null" class="text-9xl font-bold drop-shadow-lg">{{ view.countdown }}</div>
            <div v-else-if="party.fallback && !alone"
                class="pointer-events-auto flex flex-col items-center gap-3 rounded-lg bg-black/80 px-6 py-4 text-center">
                <span class="text-xl">{{ failedNames }} couldn't play {{ party.title.name }}.</span>
                <Button v-if="offeredSource" @click="watchParty.switchSource(offeredSource)">
                    Try {{ getSource(offeredSource).name }}
                </Button>
                <!-- No Syncable Source is left (fallback "tab-share"): Tab Share is offered here. -->
                <template v-else>
                    <span class="max-w-md text-muted-color">
                        Share your tab instead: play any Source here, and {{ otherName }} watches it over the
                        call. Its sound comes along in Chrome or Edge on a computer.
                    </span>
                    <WatchTabShareButton label="Share a tab"></WatchTabShareButton>
                </template>
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
        <!-- "Next episode in 10s · Cancel": the same card on both devices; Cancel cancels it for both. -->
        <div class="absolute bottom-24 right-6" aria-live="polite">
            <div v-if="view.nextEpisode"
                class="pointer-events-auto flex items-center gap-3 rounded-lg bg-black/80 py-2 pl-4 pr-3">
                <span>Next episode in {{ view.nextEpisode.secondsLeft }}s</span>
                <Button size="small" severity="secondary" @click="watchParty.cancelNextEpisode()">Cancel</Button>
            </div>
        </div>
        <!-- "Mariam paused at 1:02:14": the other Viewer's change, for a few seconds. -->
        <div class="absolute top-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
            <div v-if="view.lastChange && !inTabShare" class="rounded-lg bg-black/80 px-4 py-2 whitespace-nowrap">
                {{ describeChange(view.lastChange) }}
            </div>
            <div v-if="tabShareProblem" role="alert" class="rounded-lg bg-black/80 px-4 py-2 text-amber-300">
                {{ tabShareProblemMessage(tabShareProblem) }}
            </div>
        </div>
        <template #controls>
            <template v-if="alone">
                <span class="px-2 text-muted-color">
                    Watching alone on {{ party.tabShare ? getSource(party.tabShare.source).name : sourceName }}
                </span>
            </template>
            <!-- Tab Share: the sharer picks the Source they share; either Viewer can stop it. -->
            <template v-else-if="inTabShare">
                <WatchEpisodePicker v-if="party.episode" v-model:season="chosen.season"
                    v-model:episode="chosen.episode" :tmdb-id="party.title.tmdbId"></WatchEpisodePicker>
                <template v-if="sharingHere">
                    <label :for="tabShareSourceId" class="px-1">Sharing</label>
                    <Select v-model="tabShareSource" :label-id="tabShareSourceId" aria-label="Source you share"
                        class="rounded p-2" :options="tabShareSources" option-value="id" option-label="name"
                        append-to="self">
                    </Select>
                </template>
                <WatchTabShareButton></WatchTabShareButton>
            </template>
            <template v-else>
                <WatchEpisodePicker v-if="party.episode" v-model:season="chosen.season"
                    v-model:episode="chosen.episode" :tmdb-id="party.title.tmdbId"></WatchEpisodePicker>
                <label :for="sourcePickerId" class="px-1">Watching together on</label>
                <Select v-model="chosenSource" :label-id="sourcePickerId" aria-label="Source" class="rounded p-2"
                    :options="sourceOptions" option-value="id" option-label="name" append-to="self">
                </Select>
                <WatchTabShareButton></WatchTabShareButton>
            </template>
        </template>
    </WatchPlayerShell>
</template>
