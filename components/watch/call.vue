<script setup lang="ts">
/**
 * The Call's UI, placed once in the app layout so it survives navigation and
 * the player opening or closing: the other Viewer's voice, and a small,
 * draggable dock with the tiles and controls (or "Join call").
 *
 * While a player is open the dock teleports into the player shell's overlay
 * layer, so it floats over the player and stays visible in its fullscreen.
 * The voice's <audio> never moves. Nothing inside the dock may teleport to
 * <body> (PrimeVue Tooltip, Toast, Dialog...): it would vanish in fullscreen.
 */
import { GripVertical, Phone } from "@lucide/vue";
import { VIEWER_NAMES } from "~/models/Viewer";
import type { MediaProblem } from "~/realtime/call/device";

const { state, join } = useCall();
const presence = useOtherViewerPresence();
const overlayHost = usePlayerOverlayHost();

const dock = useTemplateRef<HTMLElement>("dock");
const { style: dockStyle, dragging } = useFloatingDrag(dock);

const otherName = computed(() => (presence.value ? VIEWER_NAMES[presence.value.viewer] : ""));
const inCall = computed(() => state.value.status !== "out");
/** "Join call" is offered whenever both Viewers are online. */
const canJoin = computed(() => !inCall.value && !!presence.value?.online);
const visible = computed(
    () => inCall.value || canJoin.value || state.value.continuedElsewhere || state.value.inCallElsewhere,
);

/** What the other Viewer's tile says about the connection. */
const otherNote = computed(() => {
    const { status, other, connection } = state.value;
    if (status === "joining") return "Joining…";
    if (!other) return "Not in the call";
    if (connection === "waiting") return "Reconnecting…";
    if (connection === "connecting") return "Connecting…";
    if (connection === "failed") return "Reconnecting…";
    return undefined;
});

const DEVICE_NAMES = { mic: "Microphone", camera: "Camera" } as const;

function problemMessage(device: keyof typeof DEVICE_NAMES, problem: MediaProblem) {
    const name = DEVICE_NAMES[device];
    const turnOn =
        device === "camera"
            ? "turn the camera on"
            : state.value.pushToTalk.on
              ? "hold to talk"
              : "turn the microphone on";
    switch (problem) {
        case "blocked":
            return `${name} blocked. Allow it in your browser's site settings (left of the address bar), then ${turnOn} again.`;
        case "not-found":
            return `No ${name.toLowerCase()} found. Connect one, then ${turnOn} again.`;
        case "in-use":
            return `${name} is in use by another app, or blocked by your system. Close that app, then ${turnOn} again.`;
        case "unsupported":
            return `This page can't use the ${name.toLowerCase()} (it needs HTTPS).`;
        default:
            return `${name} could not start. Try to ${turnOn} again.`;
    }
}

const problems = computed(() => {
    const { mic, camera } = state.value;
    return [
        mic.problem && problemMessage("mic", mic.problem),
        camera.problem && problemMessage("camera", camera.problem),
    ].filter((message): message is string => !!message);
});

// The other Viewer's voice. Played here, outside the dock, so moving the
// dock in and out of the player never interrupts it.
const voice = useTemplateRef<HTMLAudioElement>("voice");
watchEffect(() => {
    const element = voice.value;
    if (!element) return;
    const track = (state.value.remote.mic as MediaStreamTrack | null) ?? null;
    const current = (element.srcObject as MediaStream | null)?.getTracks()[0] ?? null;
    if (current === track) return;
    element.srcObject = track ? new MediaStream([track]) : null;
    if (track) element.play().catch(() => {});
});
</script>

<template>
    <audio ref="voice" autoplay class="hidden"></audio>
    <Teleport :to="overlayHost ?? 'body'">
        <section v-if="visible" ref="dock" :style="dockStyle" aria-label="Call"
            class="fixed z-[60] pointer-events-auto touch-none flex flex-col gap-2 p-2 rounded-xl bg-surface-900/90 shadow-lg ring-1 ring-surface-700 text-sm"
            :class="[inCall ? 'w-60' : 'w-auto', dragging ? 'cursor-grabbing' : 'cursor-grab']">
            <template v-if="inCall">
                <WatchCallTile :name="otherName" :video="state.remote.camera" :mic="state.other?.mic ?? false"
                    :camera="state.other?.camera ?? false" :note="otherNote"></WatchCallTile>
                <div class="flex items-end gap-2">
                    <WatchCallTile class="w-24 shrink-0" name="You" :video="state.local.camera" :mic="state.mic.on"
                        :camera="state.camera.on" mirrored></WatchCallTile>
                    <WatchCallControls class="ml-auto"></WatchCallControls>
                </div>
                <WatchCallPushToTalk></WatchCallPushToTalk>
                <p v-for="message in problems" :key="message" role="alert" class="text-xs text-amber-300 cursor-auto">
                    {{ message }}
                </p>
            </template>

            <div v-else class="flex items-center gap-2">
                <GripVertical :size="16" class="text-muted-color shrink-0" aria-hidden="true" />
                <span v-if="state.continuedElsewhere || state.inCallElsewhere" class="text-muted-color">
                    {{ state.continuedElsewhere ? "Continued on another device" : "In the call on another device" }}
                </span>
                <span v-else-if="state.other" class="text-muted-color">{{ otherName }} is in the call</span>
                <Button v-if="canJoin || state.continuedElsewhere || state.inCallElsewhere" size="small"
                    class="rounded-full px-3 py-1.5" @click="join()">
                    <Phone :size="16" />
                    {{ state.continuedElsewhere || state.inCallElsewhere ? "Join here" : "Join call" }}
                </Button>
            </div>
        </section>
    </Teleport>
</template>
