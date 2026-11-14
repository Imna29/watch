<script setup lang="ts">
/** Whether the other Viewer is online, and which Title they are watching. */
import { VIEWER_NAMES } from "~/models/Viewer";
import { WatchPlaylistItemType } from "~/models/apiModels/watch/Playlist";
import type { TitleRef } from "~/realtime/presence/protocol";

const other = useOtherViewerPresence();

function titlePath(title: TitleRef) {
    return title.contentType === WatchPlaylistItemType.MOVIE
        ? `/watch/movie/${title.tmdbId}`
        : `/watch/tv/${title.tmdbId}`;
}
</script>

<template>
    <div v-if="other" class="flex items-center gap-2 min-w-0" aria-live="polite">
        <span class="inline-block shrink-0 w-2.5 h-2.5 rounded-full"
            :class="other.online ? 'bg-green-500' : 'bg-surface-500'" aria-hidden="true"></span>
        <span class="truncate">
            {{ VIEWER_NAMES[other.viewer] }}
            <span class="hidden sm:inline text-muted-color">
                <template v-if="other.online && other.watching">
                    is watching
                    <NuxtLink :to="titlePath(other.watching)" class="italic text-color hover:underline">{{
                        other.watching.name }}</NuxtLink>
                </template>
                <template v-else-if="other.online">is online</template>
                <template v-else>is offline</template>
            </span>
        </span>
    </div>
</template>
