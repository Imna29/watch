<script setup lang="ts">
/**
 * The Watch Party's messages on every page: the invite ("Giorgi started
 * *Dune* · Join"), the Join / Replace choice, a Watch Party this Viewer
 * started on another device, and how a Watch Party ended. It floats over
 * everything, the player included, and moves into whatever is fullscreen so
 * it stays visible there.
 */
import { X } from "@lucide/vue";
import { otherViewer, VIEWER_NAMES, type Viewer } from "~/models/Viewer";
import type { EndedNotice } from "~/realtime/watchParty/device";
import type { Episode } from "~/realtime/watchParty/protocol";
import type { TitleRef } from "~/realtime/presence/protocol";

/** How long a "the Watch Party ended" notice stays. */
const ENDED_NOTICE_MS = 10_000;

const { state, join, replace, dismissChoice, cancel, dismissEnded } = useWatchParty();

const startedElsewhere = computed(() => {
    const { party, viewer, activeHere } = state.value;
    return party?.phase.name === "inviting" && party.starter === viewer && !activeHere ? party : null;
});

function label({ title, episode }: { title: TitleRef; episode: Episode | null }) {
    return episode ? `${title.name} S${episode.season}E${episode.episode}` : title.name;
}

function nameOf(viewer: Viewer) {
    return viewer === state.value.viewer ? "You" : VIEWER_NAMES[viewer];
}

function endedMessage({ reason, by }: EndedNotice) {
    return reason === "replaced"
        ? `${VIEWER_NAMES[by]} started another Watch Party instead of`
        : `${VIEWER_NAMES[by]} ended the Watch Party of`;
}

let endedTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => state.value.ended, (ended) => {
    clearTimeout(endedTimer);
    if (ended) endedTimer = setTimeout(dismissEnded, ENDED_NOTICE_MS);
});
onScopeDispose(() => clearTimeout(endedTimer));

// Anything outside the fullscreen element is hidden, so follow it there.
const fullscreenElement = shallowRef<Element | null>(null);
useEventListener(document, "fullscreenchange", () => {
    fullscreenElement.value = document.fullscreenElement;
});
const teleportTo = computed(() => fullscreenElement.value ?? "body");
</script>

<template>
    <Teleport :to="teleportTo">
        <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-2"
            aria-live="polite">
            <div v-if="state.invite" class="flex items-center gap-3 rounded-lg bg-surface-900/95 py-2 pl-4 pr-3 shadow-lg">
                <span>{{ VIEWER_NAMES[state.invite.starter] }} started <i>{{ label(state.invite) }}</i></span>
                <Button size="small" @click="join()">Join</Button>
            </div>
            <div v-else-if="startedElsewhere" class="flex items-center gap-3 rounded-lg bg-surface-900/95 py-2 pl-4 pr-3 shadow-lg">
                <span>You started <i>{{ label(startedElsewhere) }}</i> on another device, waiting for
                    {{ VIEWER_NAMES[otherViewer(startedElsewhere.starter)] }}</span>
                <Button size="small" severity="secondary" @click="cancel()">Cancel</Button>
            </div>

            <div v-if="state.choice" class="flex items-center gap-3 rounded-lg bg-surface-900/95 py-2 pl-4 pr-3 shadow-lg">
                <span>{{ nameOf(state.choice.existing.starter) }} already started
                    <i>{{ label(state.choice.existing) }}</i></span>
                <Button v-if="state.choice.canJoin" size="small" @click="join()">Join</Button>
                <Button size="small" severity="secondary" @click="replace()">Replace</Button>
                <Button size="small" text severity="secondary" aria-label="Dismiss" @click="dismissChoice()">
                    <X :size="16" />
                </Button>
            </div>

            <div v-if="state.ended" class="flex items-center gap-3 rounded-lg bg-surface-900/95 py-2 pl-4 pr-3 shadow-lg">
                <span>{{ endedMessage(state.ended) }} <i>{{ label(state.ended) }}</i></span>
                <Button size="small" text severity="secondary" aria-label="Dismiss" @click="dismissEnded()">
                    <X :size="16" />
                </Button>
            </div>
        </div>
    </Teleport>
</template>
