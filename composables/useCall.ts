import type { CallState } from "~/realtime/call/device";

/**
 * The Call on this device (`realtime/call/device.ts`): its state, kept
 * current, and its controls. The Call lives in the device's realtime
 * connection, not in a component, so it survives page navigation and the
 * player opening or closing.
 */
export function useCall() {
    const { call } = useRealtime();
    return {
        state: useDeviceState<CallState>(() => call.state, call.subscribe),
        /** Joins from this device (taking the Call over from the Viewer's other device): microphone on, camera off. */
        join: () => call.join(),
        leave: () => call.leave(),
        /** Unmutes or mutes. In push-to-talk the talk button decides instead. */
        setMic: (on: boolean) => call.setMic(on),
        setCamera: (on: boolean) => call.setCamera(on),
        setPushToTalk: (on: boolean) => call.setPushToTalk(on),
        /** Presses (true) or lets go of (false) the talk button. */
        holdToTalk: (holding: boolean) => call.holdToTalk(holding),
    };
}
