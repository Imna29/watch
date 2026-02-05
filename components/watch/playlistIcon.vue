<script lang="ts" setup>
import type { WatchPlaylist } from "~/models/apiModels/watch/Playlist";
import { ListVideo } from "lucide-vue-next";

const props = defineProps<{
    playlist: WatchPlaylist;
}>();
</script>

<template>
    <NuxtLink :to="'/watch/playlist/' + playlist.id">
        <div class="flex flex-col items-center cursor-pointer">
            <ListVideo class="w-16 h-16" />
            <div class="mt-2 text-center">{{ playlist.name }}</div>
        </div>
    </NuxtLink>
</template>
