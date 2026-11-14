<script setup lang="ts">
/**
 * A TV show page's way into one episode: "SxEy" (after `prefix`, such as
 * "Continue") plays it alone (`play`), next to "Watch together" on it.
 */
import type { TitleRef } from "~/realtime/presence/protocol";

const props = defineProps<{
    title: TitleRef;
    season: number;
    episode: number;
    prefix?: string;
}>();

const emit = defineEmits<{
    play: [season: number, episode: number];
}>();
</script>

<template>
    <div class="flex gap-2">
        <Button class="py-5 px-5 text-lg w-fit" @click="emit('play', props.season, props.episode)">
            {{ prefix ? `${prefix} ` : "" }}S{{ season }}E{{ episode }}
        </Button>
        <WatchTogetherButton :title="title" :episode="{ season, episode }"></WatchTogetherButton>
    </div>
</template>
