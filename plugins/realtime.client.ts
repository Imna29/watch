import { browserCallPlatform } from "~/realtime/call/browserPlatform";
import { systemClock } from "~/realtime/clock";
import { REALTIME_PATH } from "~/realtime/connection/protocol";
import { createRealtimeDevice } from "~/realtime/device";
import type { OpenSocket } from "~/realtime/deviceClient";

/** The browser's WebSocket, as the device client's socket. */
const openWebSocket: OpenSocket = (url, events) => {
    const socket = new WebSocket(url);
    let closed = false;
    socket.onmessage = (event) => {
        if (typeof event.data === "string") events.message(event.data);
    };
    // A refused upgrade (signed out) also ends here, as close code 1006.
    socket.onclose = () => {
        if (closed) return;
        closed = true;
        events.close();
    };
    return {
        send(data) {
            if (socket.readyState === WebSocket.OPEN) socket.send(data);
        },
        close() {
            closed = true;
            socket.close();
        },
    };
};

// This device's realtime connection (ADR 0003). Created here, connected by
// `useRealtime()` once a signed-in page uses it (layouts/watchLayout.vue).
export default defineNuxtPlugin(() => {
    const realtime = createRealtimeDevice({
        url: () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${REALTIME_PATH}`,
        openSocket: openWebSocket,
        clock: systemClock,
        call: browserCallPlatform,
    });
    return { provide: { realtime } };
});
