import type { TabShareState } from "~/realtime/watchParty/tabShareDevice";
import type { WatchPartyState } from "~/realtime/watchParty/protocol";
import { SOURCES, type SourceId } from "~/utils/sources";

export interface TabShareSnapshot extends TabShareState {
    /** Whether this device can start a Tab Share now. */
    canStart: boolean;
}

/**
 * The Source a Tab Share starts on: the first in the catalog that has not
 * failed the Watch Party's Title. The sharer can pick any other in the player.
 */
export function firstTabShareSource(party: Pick<WatchPartyState, "failedSources">): SourceId {
    return (SOURCES.find((source) => !party.failedSources.includes(source.id)) ?? SOURCES[0]!).id;
}

/**
 * Tab Share on this device (`realtime/watchParty/tabShareDevice.ts`): its
 * state, kept current, and its controls. Whether the Watch Party is in Tab
 * Share, and who shares, is in the Watch Party's state (`mode`, `tabShare`).
 */
export function useTabShare() {
    const { tabShare } = useRealtime();
    const read = (): TabShareSnapshot => ({ ...tabShare.state, canStart: tabShare.canStart });
    const state = shallowRef(read());
    onScopeDispose(tabShare.subscribe(() => {
        state.value = read();
    }));
    return {
        state: shallowReadonly(state),
        /** Shares this tab, playing `source`. Call it from the Viewer's click: the browser asks only then. */
        start: (source: SourceId) => tabShare.start(source),
        changeSource: (source: SourceId) => tabShare.changeSource(source),
        /** Stops the Tab Share for both Viewers. */
        stop: () => tabShare.stop(),
    };
}
