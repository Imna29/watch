<script setup lang="ts">
const watchStore = useWatchStore();
// Every signed-in page uses this layout: hold the realtime connection from here.
useRealtime();
// The Watch Party follows the Viewer from page to page.
const watchParty = useWatchParty();
</script>

<template>
    <div class="md:mx-auto md:max-w-[1600px] lg:px-4 sm:px-4 md:px-4 px-2">
        <LazyWatchHeader></LazyWatchHeader>
        <div class="pb-2 relative">
            <div
                class="absolute w-full h-full top-0 left-0 z-50"
                v-show="watchStore.isSearching"
            >
                <WatchSearchResults></WatchSearchResults>
            </div>
            <div v-show="!watchStore.isSearching">
                <slot />
            </div>
        </div>
        <WatchPartyPlayer v-if="watchParty.state.value.activeHere"
            :key="watchParty.state.value.party?.id"></WatchPartyPlayer>
        <WatchPartyBanner></WatchPartyBanner>
    </div>
</template>

<style scoped></style>
