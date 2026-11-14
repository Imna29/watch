/**
 * The listeners of a device module's state (presence, the Watch Party, the
 * Call...): the module's `subscribe` adds one and returns the function that
 * removes it, and the module calls `notify()` after every change. A listener
 * added or removed during `notify()` takes effect from the next one.
 */
export function createListeners() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    notify() {
      for (const listener of [...listeners]) listener();
    },

    clear() {
      listeners.clear();
    },
  };
}
