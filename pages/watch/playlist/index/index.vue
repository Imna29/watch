<script lang="ts" setup>
definePageMeta({
    layout: "watch-layout",
    auth: false,
});

const { loggedIn } = useAuth();
const { data: playlists, isPending, error } = usePlaylists();
</script>

<template>
    <div class="mt-2">
        <h1 class="text-2xl">Playlists</h1>
        
        <div v-if="!loggedIn" class="flex flex-col items-center justify-center py-12">
            <div class="text-center">
                <h2 class="text-xl mb-2">Sign in to view your playlists</h2>
                <p class="text-muted-color mb-4">Create and manage your personal movie and TV show collections</p>
                <NuxtLink to="/login">
                    <Button>Sign In</Button>
                </NuxtLink>
            </div>
        </div>
        
        <div v-else-if="isPending" class="flex justify-center py-4">
            <span>Loading playlists...</span>
        </div>
        <div v-else-if="playlists" class="flex flex-wrap gap-8 mt-4">
            <div v-for="playlist in playlists" :key="playlist.id">
                <WatchPlaylistIcon :playlist="playlist" />
            </div>
        </div>
    </div>
</template>
