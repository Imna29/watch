/**
 * Presence, on a device: what the server last said about every Viewer, and
 * telling it which Title this device's player shows.
 */
import { otherViewer, type Viewer } from "../../models/Viewer";
import type { DeviceClient } from "../deviceClient";
import type { PresenceMessage, TitleRef, ViewerPresence } from "./protocol";

export interface OtherViewerPresence extends ViewerPresence {
  viewer: Viewer;
}

export interface DevicePresence {
  /** Every Viewer's presence, as last heard from the server; null until connected. */
  readonly viewers: PresenceMessage["viewers"] | null;
  /** The other Viewer's presence; null until connected. */
  readonly other: OtherViewerPresence | null;
  /** Tells the server which Title this device's player shows (null: no player open). */
  setWatching(title: TitleRef | null): void;
  /** Calls `listener` after every change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

export function createDevicePresence(client: DeviceClient): DevicePresence {
  const listeners = new Set<() => void>();
  let viewers: PresenceMessage["viewers"] | null = null;
  let watching: TitleRef | null = null;

  function changed() {
    for (const listener of listeners) listener();
  }

  client.on("presence", (message) => {
    viewers = message.viewers;
    changed();
  });
  // A new connection starts with nothing on the server: say it again.
  client.on("welcome", () => {
    if (watching) client.send({ type: "presence:watching", title: watching });
  });
  // Cut off from the server, this device no longer knows who is online.
  client.onStatus((status) => {
    if (status === "connected" || !viewers) return;
    viewers = null;
    changed();
  });

  return {
    get viewers() {
      return viewers;
    },

    get other() {
      const me = client.identity?.viewer;
      if (!viewers || !me) return null;
      const viewer = otherViewer(me);
      return { viewer, ...viewers[viewer] };
    },

    setWatching(title) {
      watching = title;
      client.send({ type: "presence:watching", title: watching });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
