<script setup lang="ts">
/**
 * The Call's controls on this device: mute, camera and leave. Push-to-talk
 * (#14) adds a hold button here that holds the microphone on with
 * `setMic(true)` / `setMic(false)`; Tab Share (#15) adds its button here.
 */
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "@lucide/vue";

const { state, leave, setMic, setCamera } = useCall();
</script>

<template>
    <div class="flex items-center gap-1">
        <Button class="rounded-full p-2" :severity="state.mic.on ? 'secondary' : 'contrast'"
            :aria-label="state.mic.on ? 'Mute' : 'Unmute'" :aria-pressed="!state.mic.on"
            :title="state.mic.on ? 'Mute' : 'Unmute'" @click="setMic(!state.mic.on)">
            <Mic v-if="state.mic.on" :size="18" />
            <MicOff v-else :size="18" />
        </Button>
        <Button class="rounded-full p-2" :severity="state.camera.on ? 'secondary' : 'contrast'"
            :aria-label="state.camera.on ? 'Turn camera off' : 'Turn camera on'" :aria-pressed="state.camera.on"
            :title="state.camera.on ? 'Turn camera off' : 'Turn camera on'" @click="setCamera(!state.camera.on)">
            <Video v-if="state.camera.on" :size="18" />
            <VideoOff v-else :size="18" />
        </Button>
        <Button class="rounded-full p-2" severity="danger" aria-label="Leave call" title="Leave call" @click="leave()">
            <PhoneOff :size="18" />
        </Button>
    </div>
</template>
