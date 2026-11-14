const overlayHost = shallowRef<HTMLElement | null>(null);

/**
 * The open player shell's overlay layer; null while no player is open (or
 * the Watch Party player is minimized). Something that lives outside the
 * player but must float over it, and stay visible in its fullscreen (the
 * Call tiles), teleports here while it is set: in fullscreen only the
 * shell's own descendants show.
 */
export function usePlayerOverlayHost(): Readonly<ShallowRef<HTMLElement | null>> {
    return overlayHost;
}

/**
 * Makes `layer` the overlay host while the calling component (the player
 * shell) is mounted and active (pages are kept alive), and `active` holds.
 */
export function providePlayerOverlayHost(
    layer: Readonly<ShallowRef<HTMLElement | null>>,
    active: MaybeRefOrGetter<boolean> = true,
) {
    let shown = false;
    const update = () => {
        if (shown && toValue(active)) overlayHost.value = layer.value;
        else if (overlayHost.value === layer.value) overlayHost.value = null;
    };
    const show = (now: boolean) => () => {
        shown = now;
        update();
    };
    onMounted(show(true));
    onActivated(show(true));
    onDeactivated(show(false));
    onBeforeUnmount(show(false));
    watch(() => toValue(active), update);
}
