import type { CSSProperties } from "vue";

const MARGIN_PX = 8;

/**
 * Lets the Viewer drag a `position: fixed` element anywhere in the viewport
 * (or the fullscreen player). It is placed by its distance from the bottom
 * right corner, so it grows up and to the left, and is kept inside the
 * viewport as either changes size.
 *
 * Pointer capture keeps the drag going while the pointer is over the
 * Source's iframe, which would otherwise swallow the pointer events.
 * Pressing a button inside does not start a drag.
 */
export function useFloatingDrag(target: Readonly<ShallowRef<HTMLElement | null>>, initial = { right: 16, bottom: 16 }) {
    const offset = ref({ ...initial });
    const dragging = ref(false);
    let start: { pointerId: number; x: number; y: number; right: number; bottom: number } | null = null;

    function clamp() {
        const element = target.value;
        if (!element) return;
        const maxRight = Math.max(MARGIN_PX, window.innerWidth - element.offsetWidth - MARGIN_PX);
        const maxBottom = Math.max(MARGIN_PX, window.innerHeight - element.offsetHeight - MARGIN_PX);
        offset.value = {
            right: Math.min(Math.max(offset.value.right, MARGIN_PX), maxRight),
            bottom: Math.min(Math.max(offset.value.bottom, MARGIN_PX), maxBottom),
        };
    }

    useEventListener(target, "pointerdown", (event: PointerEvent) => {
        const element = target.value;
        if (!element || event.button !== 0) return;
        if ((event.target as Element | null)?.closest("button, a, input, select")) return;
        element.setPointerCapture(event.pointerId);
        start = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ...offset.value };
        dragging.value = true;
        event.preventDefault();
    });

    useEventListener(target, "pointermove", (event: PointerEvent) => {
        if (!start || event.pointerId !== start.pointerId) return;
        offset.value = {
            right: start.right - (event.clientX - start.x),
            bottom: start.bottom - (event.clientY - start.y),
        };
        clamp();
    });

    const stop = (event: PointerEvent) => {
        if (!start || event.pointerId !== start.pointerId) return;
        target.value?.releasePointerCapture(event.pointerId);
        start = null;
        dragging.value = false;
    };
    useEventListener(target, "pointerup", stop);
    useEventListener(target, "pointercancel", stop);

    useEventListener(window, "resize", clamp);
    useResizeObserver(target, clamp);

    const style = computed<CSSProperties>(() => ({
        right: `${offset.value.right}px`,
        bottom: `${offset.value.bottom}px`,
    }));

    return { style, dragging: readonly(dragging) };
}
