<script setup lang="ts">
/**
 * Push-to-talk on this device: its toggle and, while it is on, the talk
 * button. What the microphone does lives in `realtime/call/device.ts`
 * (`setPushToTalk`, `holdToTalk`); this only turns pointer events into
 * pressing and letting go.
 *
 * Mouse and touch only. There is no keyboard shortcut: key presses go to
 * the Source's iframe while it has focus.
 */
import { Mic, MicOff } from "@lucide/vue";

const { state, setPushToTalk, holdToTalk } = useCall();

/** The microphone is live because the Viewer holds the talk button. */
const talking = computed(() => state.value.pushToTalk.on && state.value.mic.on);

function press(event: PointerEvent) {
    if (event.button !== 0) return;
    // A touch is captured by the button it started on, so it would not
    // leave it: release the capture so sliding off lets go.
    const button = event.currentTarget as Element;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    holdToTalk(true);
}

/** Lets go, whatever ended the hold. Does nothing unless the button is held. */
function letGo() {
    holdToTalk(false);
}

// A release that happens elsewhere never reaches the button.
useEventListener(window, "blur", letGo);
useEventListener(document, "visibilitychange", () => {
    if (document.hidden) letGo();
});
onBeforeUnmount(letGo);
</script>

<template>
    <div class="flex flex-col gap-2">
        <Button v-if="state.pushToTalk.on"
            class="w-full justify-center rounded-full py-2 select-none touch-none [-webkit-touch-callout:none]"
            :severity="talking ? 'success' : 'secondary'" :aria-pressed="state.pushToTalk.holding"
            @pointerdown="press" @pointerup="letGo" @pointerleave="letGo" @pointercancel="letGo"
            @contextmenu.prevent>
            <Mic v-if="talking" :size="18" />
            <MicOff v-else :size="18" />
            {{ talking ? "Talking…" : "Hold to talk" }}
        </Button>
        <ToggleButton :model-value="state.pushToTalk.on" on-label="Push to talk" off-label="Push to talk" size="small"
            class="self-start rounded-full" @update:model-value="setPushToTalk"></ToggleButton>
    </div>
</template>
