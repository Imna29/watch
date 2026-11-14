import type { MediaProblem } from "~/realtime/call/device";

/** What the site asked the browser for: the Call's microphone or camera, or a tab to share (Tab Share). */
export type AskedMedia = "mic" | "camera" | "tab";

const DEVICE_NAMES = { mic: "Microphone", camera: "Camera" } as const;

/**
 * What to tell the Viewer when the browser did not give the site `asked`,
 * for `problem`. With `pushToTalk`, the microphone is turned on by holding
 * the talk button.
 */
export function mediaProblemMessage(asked: AskedMedia, problem: MediaProblem, { pushToTalk = false } = {}): string {
    if (asked === "tab") {
        switch (problem) {
            case "unsupported":
                return "This browser can't share a tab. Use Chrome or Edge on a computer.";
            case "blocked":
                return "No tab was shared. To share, choose this tab in the browser's dialog.";
            default:
                return "Your tab couldn't be shared. Try again.";
        }
    }
    const name = DEVICE_NAMES[asked];
    const turnOn = asked === "camera" ? "turn the camera on" : pushToTalk ? "hold to talk" : "turn the microphone on";
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
