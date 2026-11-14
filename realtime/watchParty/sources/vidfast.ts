/**
 * The VidFast adapter, after VidFast's docs (https://vidfast.vc/) as of
 * November 2026:
 * - commands: `{ command: "play" }`, `{ command: "pause" }`,
 *   `{ command: "seek", time }` (whole seconds) and `{ command: "getStatus" }`,
 *   which the player answers with a "playerstatus" event. There is no speed
 *   command, and no "ratechange" event: VidFast plays at normal speed;
 * - events: `{ type: "PLAYER_EVENT", data: { event, currentTime, duration,
 *   playing, ... } }`, for "play", "pause", "seeked", "timeupdate" (about
 *   once a second), "ended" and "playerstatus";
 * - there is no "ready" and no "error" event. The player is ready at its
 *   first event that knows the video's duration, so until then the adapter
 *   asks for its status. The undocumented `{ event: "status", data: 404 }`
 *   says no server of VidFast has the Title.
 */
import { getSource } from "../../../utils/sources";
import {
  createSourceLink,
  sourceFailed,
  type AdapterFactory,
  type AdapterOptions,
  type PlayerEvent,
  type SyncableSourceAdapter,
} from "./adapter";

/** How often a player that is not ready yet is asked for its status. */
const READY_POLL_MS = 500;

/** The `data` of a VidFast `PLAYER_EVENT`. */
interface VidFastPlayerEvent {
  event: string;
  currentTime?: unknown;
  duration?: unknown;
  playing?: unknown;
}

function playerEventOf(data: unknown): VidFastPlayerEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, data: payload } = data as { type?: unknown; data?: unknown };
  if (type !== "PLAYER_EVENT" || typeof payload !== "object" || payload === null) return null;
  return typeof (payload as { event?: unknown }).event === "string" ? (payload as VidFastPlayerEvent) : null;
}

/** VidFast's own `{ event: "status", data: 404 }`: every server it tried lacks the Title. */
function saysUnavailable(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const message = data as { event?: unknown; data?: unknown };
  return message.event === "status" && message.data === 404;
}

function seconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** VidFast has no speed command. */
const CAN_SET_RATE = false;

function createAdapter(options: AdapterOptions): SyncableSourceAdapter {
  const source = getSource("vidfast");
  const { clock } = options;
  let pollTimer: unknown = null;

  const link = createSourceLink(source, options, (data) => {
    if (saysUnavailable(data)) {
      if (!link.ready) link.emit({ type: "error", reason: "unavailable", message: `${source.name} has no server with this Title.` });
      return;
    }
    const message = playerEventOf(data);
    if (!message) return;
    if (!link.ready) {
      // A player that knows how long the video is has loaded it, and takes commands.
      const duration = seconds(message.duration);
      if (duration === null || duration <= 0) return;
      link.emit({ type: "ready" });
    }
    const event = translate(message);
    if (event) link.emit(event);
  });

  // Asking stops once the wait for "ready" is over: when it came, or the Source failed (or timed out).
  link.on((event) => {
    if (event.type === "ready" || sourceFailed(event)) stopAsking();
  });

  function translate(message: VidFastPlayerEvent): PlayerEvent | null {
    const position = seconds(message.currentTime);
    switch (message.event) {
      case "play":
        return { type: "play" };
      case "pause":
        return { type: "pause" };
      case "ended":
        return { type: "ended" };
      case "seeked":
        return position === null ? null : { type: "seeked", position };
      case "timeupdate": {
        if (position === null) return null;
        const duration = seconds(message.duration);
        return duration === null ? { type: "timeupdate", position } : { type: "timeupdate", position, duration };
      }
      case "playerstatus":
        return position === null || typeof message.playing !== "boolean"
          ? null
          : { type: "status", position, paused: !message.playing };
      default:
        return null;
    }
  }

  function stopAsking() {
    if (pollTimer !== null) clock.clearTimeout(pollTimer);
    pollTimer = null;
  }

  function askUntilReady() {
    pollTimer = clock.setTimeout(() => {
      link.probe({ command: "getStatus" });
      askUntilReady();
    }, READY_POLL_MS);
  }

  return {
    source,
    canSetRate: CAN_SET_RATE,

    load(playable, startAt) {
      stopAsking();
      link.load(source.embedUrl(playable, { startAt }));
      askUntilReady();
    },

    play() {
      link.post({ command: "play" });
    },

    pause() {
      link.post({ command: "pause" });
    },

    seek(position) {
      // The docs: "Seek commands accept time in seconds (integer values)".
      link.post({ command: "seek", time: Math.round(position) });
    },

    setRate() {},

    requestStatus() {
      link.post({ command: "getStatus" });
    },

    on: link.on,

    destroy() {
      stopAsking();
      link.destroy();
    },
  };
}

export const createVidFastAdapter: AdapterFactory = Object.assign(createAdapter, { canSetRate: CAN_SET_RATE });
