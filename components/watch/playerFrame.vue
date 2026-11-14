<script lang="ts" setup>
/**
 * What both players share, the solo one (`<WatchPlayerShell>`) and the
 * Watch Party's (`<WatchPartyPlayer>`): a full-viewport container with a
 * Source's iframe at `src`, a control bar with the site's own fullscreen
 * button and "Close", and the overlay layer. It tells the other Viewer which
 * Title is open here (presence).
 *
 * Fullscreen applies to this container, never to the iframe, so anything
 * rendered inside it stays visible in fullscreen:
 * - the default slot is the overlay layer above the player (Watch Party
 *   messages, countdowns...). The layer lets clicks through to the player;
 *   an overlay that needs clicks sets `pointer-events-auto`. Overlays that
 *   live outside the player (the Call's tiles, `<WatchCall>`) teleport into
 *   the same layer through `usePlayerOverlayHost()`.
 * - the `controls` slot adds items to the control bar, before fullscreen and "Close".
 * - the `behind` slot is under the iframe, seen until the Source draws over it.
 * Popups inside the frame must render inside it too (e.g. `append-to="self"`
 * on PrimeVue Selects): anything teleported to <body> is hidden in fullscreen.
 *
 * A `minimizable` player can be minimized (`v-model:minimized`): it shrinks
 * to a mini-player in a corner, its iframe untouched so it plays on, and the
 * Viewer can browse the site. The `mini` slot is a short status line there;
 * "Back to player" restores it.
 */
import { Maximize, Maximize2, Minimize, PictureInPicture2 } from "@lucide/vue";
import type { WatchPlaylistItemType } from "~/models/apiModels/watch/Playlist";

const props = defineProps<{
    contentType: WatchPlaylistItemType;
    tmdbId: number;
    /** The Title's name, shown to the other Viewer while this player is open. */
    title: string;
    /** The Source's iframe URL; none while empty. */
    src: string;
    /** Offers "Minimize". */
    minimizable?: boolean;
}>();

const minimized = defineModel<boolean>("minimized", { default: false });

const emit = defineEmits<{
    close: [];
}>();

const mini = computed(() => props.minimizable && minimized.value);

const frame = useTemplateRef<HTMLElement>("frame");
const iframe = useTemplateRef<HTMLIFrameElement>("iframe");
// Overlays from outside the player (the Call's tiles, from the app layout) teleport into this layer;
// not into the mini-player, which is too small for them.
providePlayerOverlayHost(useTemplateRef<HTMLElement>("overlay"), () => !mini.value);

const {
    isSupported: canFullscreen,
    isFullscreen,
    toggle: toggleFullscreen,
    exit: exitFullscreen,
} = useFullscreen(frame, { autoExit: true });

function minimize() {
    if (isFullscreen.value) exitFullscreen();
    minimized.value = true;
}

useWatchingPresence(() => ({ contentType: props.contentType, tmdbId: props.tmdbId, name: props.title }));

defineExpose({
    /** The current Source's iframe. It is replaced whenever the URL changes. */
    iframe,
});
</script>

<template>
    <Teleport to="body">
        <!-- Minimized, the same element (and iframe) shrinks to a corner: the player plays on. -->
        <div ref="frame" class="bg-black fixed" :class="mini
            ? 'bottom-4 left-4 z-40 aspect-video w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg shadow-lg ring-1 ring-surface-700'
            : 'top-0 left-0 z-10 w-dvw h-dvh'">
            <slot name="behind"></slot>

            <!--
                A new iframe per URL, so switching Source or episode adds no browser history entries.
                No fullscreen permission: only the frame goes fullscreen, so overlays stay visible.
            -->
            <iframe v-if="src" ref="iframe" :key="src" :src="src"
                class="absolute top-0 left-0 w-full h-full" frameborder="0"
                allow="autoplay; encrypted-media; picture-in-picture"></iframe>

            <div v-show="!mini" ref="overlay" class="absolute inset-0 pointer-events-none">
                <slot></slot>
            </div>

            <div v-if="mini" class="absolute inset-x-0 top-0 flex items-center gap-1 bg-black/70 py-0.5 pl-2 pr-0.5 text-xs">
                <span class="min-w-0 flex-1 truncate">
                    {{ title }}<span v-if="$slots.mini" class="text-muted-color"> · <slot name="mini"></slot></span>
                </span>
                <Button size="small" text severity="secondary" class="p-1" aria-label="Back to player"
                    @click="minimized = false">
                    <Maximize2 :size="16" />
                </Button>
            </div>
            <div v-else class="absolute top-0 right-2 flex flex-wrap place-content-end items-center gap-1 pt-2">
                <slot name="controls"></slot>
                <Button v-if="minimizable" class="rounded-full p-2" severity="secondary"
                    aria-label="Minimize" title="Keep watching in a corner while you browse" @click="minimize()">
                    <PictureInPicture2 />
                </Button>
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
