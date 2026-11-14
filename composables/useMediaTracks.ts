import type { MediaTrack } from "~/realtime/call/platform";

/**
 * Keeps `element` (a `<video>` or `<audio>`) playing exactly `tracks()`, the
 * ones that are set: a new `MediaStream` whenever they change, none while
 * there are none. `started` runs after each new stream that has tracks,
 * e.g. to call `play()`.
 */
export function useMediaTracks(
    element: Readonly<ShallowRef<HTMLMediaElement | null>>,
    tracks: () => readonly (MediaTrack | null | undefined)[],
    started?: (element: HTMLMediaElement) => void,
) {
    watchEffect(() => {
        const media = element.value;
        if (!media) return;
        const wanted = tracks().filter((track) => !!track) as MediaStreamTrack[];
        const current = (media.srcObject as MediaStream | null)?.getTracks() ?? [];
        if (wanted.length === current.length && wanted.every((track) => current.includes(track))) return;
        media.srcObject = wanted.length > 0 ? new MediaStream(wanted) : null;
        if (wanted.length > 0) started?.(media);
    });
}
