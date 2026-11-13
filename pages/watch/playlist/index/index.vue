<script lang="ts" setup>
definePageMeta({
    layout: "watch-layout",
});

const { data: playlists, isPending, error } = usePlaylists();
</script>

<template>
    <div class="mt-2">
        <h1 class="text-2xl">Playlists</h1>

        <div v-if="isPending" class="flex justify-center py-4">
            <span>Loading playlists...</span>
        </div>
        <div v-else-if="playlists" class="flex flex-wrap gap-8 mt-4">
            <div v-for="playlist in playlists" :key="playlist.id">
                <WatchPlaylistIcon :playlist="playlist" />
            </div>
        </div>
    </div>
</template>
