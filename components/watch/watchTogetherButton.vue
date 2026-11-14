<script setup lang="ts">
/** "Watch together": starts a Watch Party on a movie, or on one episode of a TV show. */
import { Users } from "@lucide/vue";
import type { TitleRef } from "~/realtime/presence/protocol";
import type { Episode } from "~/realtime/watchParty/protocol";

const props = defineProps<{
    title: TitleRef;
    /** The episode, for a TV show; null for a movie. */
    episode: Episode | null;
    /** The small button of a player's control bar, rather than a Title page's. */
    compact?: boolean;
}>();

const { state, start } = useWatchParty();
</script>

<template>
    <Button :class="compact ? 'rounded-full p-2' : 'py-5 px-5 text-lg'" severity="secondary"
        :disabled="!state.connected" @click="start(props.title, props.episode)">
        <Users v-if="!compact" /> Watch together
    </Button>
</template>
