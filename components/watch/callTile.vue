<script setup lang="ts">
/** One Viewer in the Call: their camera, or their initial while it is off, with mic and camera indicators. */
import { MicOff, VideoOff } from "@lucide/vue";
import type { MediaTrack } from "~/realtime/call/platform";

const props = defineProps<{
    name: string;
    /** The camera track to show; nothing while the camera is off. */
    video: MediaTrack | null;
    mic: boolean;
    camera: boolean;
    /** Flip the picture, as Viewers expect of their own camera. */
    mirrored?: boolean;
    /** A line under the name, e.g. "Connecting…". */
    note?: string;
}>();

const videoElement = useTemplateRef<HTMLVideoElement>("videoElement");
const showVideo = computed(() => props.camera && !!props.video);

watchEffect(() => {
    const element = videoElement.value;
    if (!element) return;
    const track = showVideo.value ? (props.video as MediaStreamTrack) : null;
    const current = (element.srcObject as MediaStream | null)?.getTracks()[0] ?? null;
    if (current !== track) element.srcObject = track ? new MediaStream([track]) : null;
});

// Moving the tiles into or out of the player shell can pause the video: play on.
function keepPlaying() {
    if (showVideo.value) videoElement.value?.play().catch(() => {});
}
</script>

<template>
    <div class="relative overflow-hidden rounded-lg bg-surface-800 aspect-video select-none">
        <video ref="videoElement" v-show="showVideo" autoplay playsinline muted
            class="absolute inset-0 w-full h-full object-cover" :class="{ '-scale-x-100': mirrored }"
            @pause="keepPlaying"></video>
        <div v-if="!showVideo" class="absolute inset-0 flex items-center justify-center">
            <span class="flex items-center justify-center w-10 h-10 rounded-full bg-surface-600 text-lg font-semibold"
                aria-hidden="true">{{ name.charAt(0) }}</span>
        </div>
        <div class="absolute left-0 right-0 bottom-0 flex items-center gap-1 px-1.5 py-0.5 text-xs bg-black/50">
            <span class="truncate">{{ name }}<template v-if="note"> · {{ note }}</template></span>
            <span class="ml-auto flex gap-1 shrink-0">
                <MicOff v-if="!mic" :size="14" aria-label="Microphone off" />
                <VideoOff v-if="!camera" :size="14" aria-label="Camera off" />
            </span>
        </div>
    </div>
</template>
