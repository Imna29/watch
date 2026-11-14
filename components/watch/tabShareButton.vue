<script setup lang="ts">
/**
 * Tab Share's button, in the Watch Party player's controls and the Call's
 * dock: "Share a tab" while this device can start one (it takes part in the
 * Watch Party), playing the first Source that has not failed (the sharer
 * picks another in the player), and "Stop Tab Share", for either Viewer,
 * while the Watch Party is in Tab Share. Nothing otherwise. The Watch Party
 * player says why when no tab could be shared.
 */
import { ScreenShare, ScreenShareOff } from "@lucide/vue";

const props = defineProps<{
    /** Icon only, for the Call's dock. */
    compact?: boolean;
    /** The start button's label; "Share a tab" by default. */
    label?: string;
}>();

const watchParty = useWatchParty();
const tabShare = useTabShare();
const party = computed(() => (watchParty.state.value.activeHere ? watchParty.state.value.party : null));
const inTabShare = computed(() => party.value?.mode === "tab-share");
const startLabel = computed(() => props.label ?? "Share a tab");

// Straight from the click: the browser asks for the tab only then.
function share() {
    if (party.value) void tabShare.start(firstTabShareSource(party.value));
}
</script>

<template>
    <Button v-if="inTabShare" class="rounded-full p-2" severity="secondary" aria-label="Stop Tab Share"
        title="Stop Tab Share" @click="tabShare.stop()">
        <ScreenShareOff :size="18" />
        <span v-if="!compact">Stop Tab Share</span>
    </Button>
    <Button v-else-if="tabShare.state.value.canStart" class="rounded-full p-2"
        :severity="compact ? 'secondary' : undefined" :aria-label="startLabel" :title="startLabel"
        :disabled="tabShare.state.value.starting" @click="share()">
        <ScreenShare :size="18" />
        <span v-if="!compact">{{ startLabel }}</span>
    </Button>
</template>
