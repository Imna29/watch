/**
 * The CineSrc adapter, after CineSrc's docs (https://cinesrc.st/docs) as of
 * November 2026:
 * - commands: `{ type: "cinesrc:command", command, args }`; getters answer
 *   with `{ type: "cinesrc:response", command, result }` (no request id, so
 *   at most one question per getter is outstanding);
 * - events: `{ type: "cinesrc:<event>", ...payload }`, payload fields flat;
 * - `cinesrc:ready` comes once per load and commands sent before it are
 *   dropped. When no server has the Title, nothing comes at all.
 */
import { getSource } from "../../../utils/sources";
import {
  createSourceLink,
  type AdapterFactory,
  type AdapterOptions,
  type PlayerEvent,
  type SyncableSourceAdapter,
} from "./adapter";

/** A status question unanswered for this long is asked again. */
const STATUS_RETRY_MS = 2000;

interface CineSrcMessage {
  type: `cinesrc:${string}`;
  [field: string]: unknown;
}

function isCineSrcMessage(data: unknown): data is CineSrcMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { type?: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith("cinesrc:")
  );
}

function seconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** CineSrc takes `setPlaybackRate`. */
const CAN_SET_RATE = true;

function createAdapter(options: AdapterOptions): SyncableSourceAdapter {
  const source = getSource("cinesrc");
  /** The status question in flight: the answers so far. */
  let asking: { sentAt: number; position: number | null; paused: boolean | null } | null = null;

  const link = createSourceLink(source, options, (data) => {
    if (!isCineSrcMessage(data)) return;
    const event = translate(data);
    if (event) link.emit(event);
  });

  function translate(message: CineSrcMessage): PlayerEvent | null {
    switch (message.type) {
      case "cinesrc:ready":
        return { type: "ready" };
      case "cinesrc:play":
        return { type: "play" };
      case "cinesrc:pause":
        return { type: "pause" };
      case "cinesrc:ended":
        return { type: "ended" };
      // `autonext=false` stops only the automatic next episode: its episode list and next button still move it.
      case "cinesrc:nextepisode": {
        const { season, episode } = message;
        return Number.isInteger(season) && Number.isInteger(episode)
          ? { type: "episode", season: season as number, episode: episode as number }
          : null;
      }
      case "cinesrc:seeked":
      case "cinesrc:timeupdate": {
        const position = seconds(message.currentTime);
        if (position === null) return null;
        if (message.type === "cinesrc:seeked") return { type: "seeked", position };
        // `duration` is NaN until the player has the stream's metadata.
        const duration = seconds(message.duration);
        return duration === null ? { type: "timeupdate", position } : { type: "timeupdate", position, duration };
      }
      case "cinesrc:ratechange": {
        const rate = seconds(message.playbackRate);
        return rate === null ? null : { type: "ratechange", rate };
      }
      case "cinesrc:error":
        return {
          type: "error",
          reason: "playback",
          message: typeof message.error === "string" ? message.error : "Unknown error",
        };
      case "cinesrc:response":
        return answer(message.command, message.result);
      default:
        return null;
    }
  }

  /** Collects the getter answers to a status question; the last one completes it. */
  function answer(command: unknown, result: unknown): PlayerEvent | null {
    if (!asking) return null;
    if (command === "getCurrentTime" && seconds(result) !== null) asking.position = seconds(result);
    if (command === "getPaused" && typeof result === "boolean") asking.paused = result;
    if (asking.position === null || asking.paused === null) return null;
    const { position, paused } = asking;
    asking = null;
    return { type: "status", position, paused };
  }

  function command(name: string, args?: unknown[]) {
    link.post({ type: "cinesrc:command", command: name, ...(args ? { args } : {}) });
  }

  return {
    source,
    canSetRate: CAN_SET_RATE,

    load(playable, startAt) {
      asking = null;
      link.load(source.embedUrl(playable, { startAt }));
    },

    play() {
      // CineSrc never answers `play` (it tries to post back a Promise); its "play" event confirms it.
      command("play");
    },

    pause() {
      command("pause");
    },

    seek(position) {
      command("seek", [position]);
    },

    setRate(rate) {
      command("setPlaybackRate", [rate]);
    },

    requestStatus() {
      if (!link.ready) return;
      const now = options.clock.now();
      if (asking && now - asking.sentAt < STATUS_RETRY_MS) return;
      asking = { sentAt: now, position: null, paused: null };
      command("getCurrentTime");
      command("getPaused");
    },

    on: link.on,
    destroy: link.destroy,
  };
}

export const createCineSrcAdapter: AdapterFactory = Object.assign(createAdapter, { canSetRate: CAN_SET_RATE });
