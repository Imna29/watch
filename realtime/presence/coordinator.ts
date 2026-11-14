/**
 * Presence, on the server: which Viewers are online and what they are
 * watching. Every device gets the whole picture as it connects, and again
 * whenever it changes.
 */
import { z } from "zod";
import { VIEWERS, type Viewer } from "../../models/Viewer";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import type { Device, FeatureFactory } from "../coordinator";
import type { DeviceId } from "../protocol";
import type { PresenceMessage, TitleRef, ViewerPresence, WatchingMessage } from "./protocol";

/** Validates a `TitleRef` from a device. */
export const titleRefSchema = z.object({
  contentType: z.enum(WatchPlaylistItemType),
  tmdbId: z.number().int().positive(),
  name: z.string().max(500),
});

const watchingSchema = z.object({
  type: z.literal("presence:watching"),
  title: titleRefSchema.nullable(),
});

export interface PresenceOptions {
  /**
   * How long a Viewer still shows as online after their last device
   * disconnected, so reloading a page does not flash "offline".
   */
  offlineGraceMs?: number;
}

export function presence({ offlineGraceMs = 2000 }: PresenceOptions = {}): FeatureFactory {
  return (context) => {
    /** What each device's player shows, with a counter that orders when they opened it. */
    const watching = new Map<DeviceId, { title: TitleRef; order: number }>();
    let watchingCount = 0;
    /** When each Viewer's last device disconnected, while that is within the grace period. */
    const leftAt = new Map<Viewer, number>();
    let lastSent: string | undefined;

    function presenceOf(viewer: Viewer): ViewerPresence {
      const devices = context.devices().filter((device) => device.viewer === viewer);
      // The Title opened most recently on any of the Viewer's devices.
      let latest: { title: TitleRef; order: number } | undefined;
      for (const device of devices) {
        const entry = watching.get(device.id);
        if (entry && (!latest || entry.order > latest.order)) latest = entry;
      }
      return { online: devices.length > 0 || leftAt.has(viewer), watching: latest?.title ?? null };
    }

    function snapshot(): PresenceMessage {
      const viewers = Object.fromEntries(
        VIEWERS.map((viewer) => [viewer, presenceOf(viewer)]),
      ) as Record<Viewer, ViewerPresence>;
      return { type: "presence", viewers };
    }

    /** Tells every device about a change; `newDevice` hears it even when nothing changed. */
    function share(newDevice?: Device) {
      const message = snapshot();
      const text = JSON.stringify(message);
      const changed = text !== lastSent;
      lastSent = text;
      for (const device of context.devices()) {
        if (changed || device.id === newDevice?.id) context.send(device.id, message);
      }
    }

    return {
      handlers: {
        "presence:watching": {
          schema: watchingSchema satisfies z.ZodType<WatchingMessage>,
          handle(from, { title }) {
            if (title) watching.set(from.id, { title, order: ++watchingCount });
            else watching.delete(from.id);
            share();
          },
        },
      },
      connected(device) {
        leftAt.delete(device.viewer);
        share(device);
      },
      disconnected(device) {
        watching.delete(device.id);
        if (!context.devices().some((other) => other.viewer === device.viewer)) {
          leftAt.set(device.viewer, context.now());
        }
        share();
      },
      tick() {
        for (const [viewer, at] of leftAt) {
          if (context.now() - at >= offlineGraceMs) leftAt.delete(viewer);
        }
        share();
      },
    };
  };
}
