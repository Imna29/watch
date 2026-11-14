const overlayHost = shallowRef<HTMLElement | null>(null);

/**
 * The open player shell's overlay layer; null while no player is open.
 * Something that lives outside the player but must float over it, and stay
 * visible in its fullscreen (the Call tiles), teleports here while it is set:
 * in fullscreen only the shell's own descendants show.
 */
export function usePlayerOverlayHost(): Readonly<ShallowRef<HTMLElement | null>> {
    return overlayHost;
}

/**
 * Makes `layer` the overlay host while the calling component (the player
 * shell) is mounted and active (pages are kept alive).
 */
export function providePlayerOverlayHost(layer: Readonly<ShallowRef<HTMLElement | null>>) {
    const claim = () => {
        overlayHost.value = layer.value;
    };
    const release = () => {
        if (overlayHost.value === layer.value) overlayHost.value = null;
    };
    onMounted(claim);
    onActivated(claim);
    onDeactivated(release);
    onBeforeUnmount(release);
}
