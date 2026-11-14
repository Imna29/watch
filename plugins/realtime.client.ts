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

const DEVICE_KEY_STORAGE = "watch:device-key";

/**
 * This tab's device key (`DeviceKey`), which a reload keeps so the tab
 * rejoins a Watch Party as the same Device. It lives in sessionStorage only
 * while the page is away: taken out as the page starts and put back as it
 * goes, so a duplicated tab (which copies sessionStorage) gets its own.
 */
function tabDeviceKey(): string {
    let key: string | null = null;
    try {
        key = sessionStorage.getItem(DEVICE_KEY_STORAGE);
        sessionStorage.removeItem(DEVICE_KEY_STORAGE);
    } catch {
        // Storage blocked: this page is a Device of its own.
    }
    const own = key ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    addEventListener("pagehide", () => {
        try {
            sessionStorage.setItem(DEVICE_KEY_STORAGE, own);
        } catch {
            // Nothing to keep it in.
        }
    });
    // Back from the back/forward cache: the page goes on, so the key is not left for a copy.
    addEventListener("pageshow", (event: PageTransitionEvent) => {
        if (!event.persisted) return;
        try {
            sessionStorage.removeItem(DEVICE_KEY_STORAGE);
        } catch {
            // Nothing to take it from.
        }
    });
    return own;
}

// This device's realtime connection (ADR 0003). Created here, connected by
// `useRealtime()` once a signed-in page uses it (layouts/watchLayout.vue).
export default defineNuxtPlugin(() => {
    const realtime = createRealtimeDevice({
        url: () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${REALTIME_PATH}`,
        openSocket: openWebSocket,
        clock: systemClock,
        deviceKey: tabDeviceKey(),
        call: browserCallPlatform,
    });
    return { provide: { realtime } };
});
