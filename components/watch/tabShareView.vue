<script setup lang="ts">
/**
 * What the Watch Party player shows over itself in Tab Share. On the other
 * Viewer's device: the shared tab, picture and sound, at full size under
 * the Call's tiles (which the Call teleports in after it). It comes over
 * the Call, so until this device is in the Call it offers to join. On the
 * sharer's device the player shell plays the Source itself: a note says it
 * is shared, and explains when its sound is not.
 */
import { otherViewer, VIEWER_NAMES } from "~/models/Viewer";
import type { WatchPartyState } from "~/realtime/watchParty/protocol";

const props = defineProps<{ party: WatchPartyState }>();

const watchParty = useWatchParty();
const { state: call, join } = useCall();

const share = computed(() => props.party.tabShare);
const me = computed(() => watchParty.state.value.viewer);
const sharingHere = computed(() => !!share.value && share.value.sharer === me.value);
const sharerName = computed(() => (share.value ? VIEWER_NAMES[share.value.sharer] : ""));
const otherName = computed(() => (me.value ? VIEWER_NAMES[otherViewer(me.value)] : ""));
/** The Watch Party is on (not ended because a Viewer left). */
const live = computed(() => props.party.phase.name !== "ended");

// The other Viewer's device: the shared tab, as the Call receives it.
const screen = useTemplateRef<HTMLVideoElement>("screen");
const inCall = computed(() => call.value.status === "in");
/** The browser refused to start the shared tab's sound by itself: the Viewer starts it. */
const needsClick = ref(false);

watchEffect(() => {
    const element = screen.value;
    if (!element) return;
    const { tabVideo, tabAudio } = call.value.remote;
    const wanted = [tabVideo, tabAudio].filter((track) => !!track) as MediaStreamTrack[];
    const current = (element.srcObject as MediaStream | null)?.getTracks() ?? [];
    if (wanted.length === current.length && wanted.every((track) => current.includes(track))) return;
    element.srcObject = wanted.length > 0 ? new MediaStream(wanted) : null;
    if (wanted.length > 0) play();
});

function play() {
    screen.value?.play().then(
        () => (needsClick.value = false),
        () => (needsClick.value = true),
    );
}

/** What the other Viewer's device says over the shared tab, if anything. */
const status = computed(() => {
    if (call.value.status === "joining") return "Joining the call…";
    if (call.value.connection !== "connected") return `Connecting to ${sharerName.value}'s tab…`;
    return null;
});
</script>

<template>
    <template v-if="live && share && !sharingHere">
        <!-- Native controls for this Viewer's own volume; fullscreen is the shell's, so the Call's tiles stay. -->
        <video ref="screen" autoplay playsinline controls disablepictureinpicture
            controlslist="nofullscreen nodownload noplaybackrate noremoteplayback"
            class="pointer-events-auto absolute inset-0 h-full w-full bg-black object-contain"
            :aria-label="`${sharerName}'s shared tab`"></video>
        <div v-if="call.status === 'out'" class="pointer-events-auto relative flex max-w-md flex-col items-center
            gap-3 rounded-lg bg-black/80 px-6 py-4 text-center">
            <span class="text-xl">{{ sharerName }} is sharing their tab</span>
            <span class="text-muted-color">It comes over the call: join to watch it.</span>
            <Button @click="join()">{{ call.inCallElsewhere ? "Join here" : "Join call" }}</Button>
        </div>
        <div v-else-if="status" class="relative rounded-lg bg-black/80 px-6 py-4 text-xl">{{ status }}</div>
        <Button v-else-if="needsClick" class="pointer-events-auto relative" @click="play()">
            Play {{ sharerName }}'s tab
        </Button>
        <p v-if="inCall && !share.sound"
            class="absolute top-2 left-2 max-w-sm rounded-lg bg-black/80 px-3 py-2 text-sm">
            {{ sharerName }}'s browser shares the picture only, without sound.
        </p>
    </template>

    <div v-else-if="live && share" role="status"
        class="absolute top-2 left-2 flex max-w-sm flex-col gap-1 rounded-lg bg-black/80 px-3 py-2 text-sm">
        <span>You're sharing this tab with {{ otherName }}.</span>
        <span v-if="!call.other" class="text-muted-color">
            {{ otherName }} isn't in the call yet, and sees your tab once they join.
        </span>
        <span v-if="!share.sound" class="text-amber-300">
            Its sound isn't shared, so {{ otherName }} can't hear it: this browser can't share a tab's sound, or
            "Also share tab audio" was off. Stop the Tab Share and share again, in Chrome or Edge on a computer,
            with it on.
        </span>
    </div>
</template>
