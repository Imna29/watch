<script lang="ts" setup>
const props = defineProps<{
    tmdbId: number;
}>();

const season = defineModel<number>("season", { required: true });
const episode = defineModel<number>("episode", { required: true });

const { data: tvShow } = useTvShow(() => props.tmdbId);
const { data: seasonData } = useSeasonData(() => props.tmdbId, season);
const seasons = computed(() => tvShow.value?.seasons ?? []);
const episodes = computed(() => seasonData.value?.episodes ?? []);

// Set both at once, so a new season never plays (or records) the old episode number.
function chooseSeason(seasonNumber: number) {
    season.value = seasonNumber;
    episode.value = 1;
}
</script>

<template>
    <div class="flex gap-1">
        <!-- append-to="self" keeps the dropdowns visible while the player shell is fullscreen. -->
        <Select :model-value="season" @update:model-value="chooseSeason" class="rounded p-2" :options="seasons"
            data-key="season_number" option-value="season_number" option-label="name" append-to="self"
            aria-label="Season">
        </Select>
        <Select v-model="episode" class="rounded p-2" :options="episodes" v-if="episodes.length > 0"
            option-value="episode_number" option-label="name" append-to="self" aria-label="Episode">
        </Select>
    </div>
</template>
