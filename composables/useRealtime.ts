import type { RealtimeDevice } from "~/realtime/device";
import type { OtherViewerPresence } from "~/realtime/presence/device";
import type { TitleRef } from "~/realtime/presence/protocol";

/**
 * This device's realtime connection (`plugins/realtime.client.ts`). The
 * first call connects it; it then stays connected, reconnecting by itself,
 * for as long as the page is open.
 */
export function useRealtime(): RealtimeDevice {
    const { $realtime } = useNuxtApp();
    $realtime.client.start();
    return $realtime;
}

/** The other Viewer: online or not, and the Title they are watching. Null until connected. */
export function useOtherViewerPresence(): Readonly<Ref<OtherViewerPresence | null>> {
    const { presence } = useRealtime();
    const other = shallowRef(presence.other);
    onScopeDispose(presence.subscribe(() => {
        other.value = presence.other;
    }));
    return shallowReadonly(other);
}

/**
 * Tells the other Viewer that this device is watching `title`, for as long as
 * the calling component is mounted and active (pages are kept alive).
 */
export function useWatchingPresence(title: MaybeRefOrGetter<TitleRef>) {
    const { presence } = useRealtime();
    let active = true;
    const report = () => presence.setWatching(active ? { ...toValue(title) } : null);

    watch(() => toValue(title), report, { immediate: true, deep: true });
    onActivated(() => {
        active = true;
        report();
    });
    onDeactivated(() => {
        active = false;
        report();
    });
    onScopeDispose(() => presence.setWatching(null));
}
