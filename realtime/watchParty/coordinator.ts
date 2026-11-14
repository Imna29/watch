/**
 * The Watch Party, on the server: the single authority over the one Watch
 * Party there can be at a time (ADR 0002). Devices send intents; every change
 * goes out to every device as the whole new shared state, with a growing
 * sequence number.
 */
import { z } from "zod";
import { WatchPlaylistItemType } from "../../models/apiModels/watch/Playlist";
import { VIEWERS, type Viewer } from "../../models/Viewer";
import type { SourceId } from "../../utils/sources";
import type { Device, FeatureFactory, MessageHandler, MessageHandlers } from "../coordinator";
import type { DeviceId, DeviceMessageType } from "../protocol";
import { titleRefSchema } from "../presence/coordinator";
import type { TitleRef } from "../presence/protocol";
import type {
  CancelNextEpisodeMessage,
  CancelWatchPartyMessage,
  Episode,
  JoinWatchPartyMessage,
  LeaveWatchPartyMessage,
  PlayerStatusMessage,
  StartWatchPartyMessage,
  TakeOverWatchPartyMessage,
  WatchPartyEndReason,
  WatchPartyState,
} from "./protocol";
import { takesPlaybackChanges, type ChangeEpisodeMessage } from "./protocol";
import { afterEpisodeEnded, titleEndedSchema } from "./ending";
import { afterEpisodeChange, afterPlaybackChange, episodeSchema, playbackSchema, sameEpisode } from "./sharedControls";
import {
  afterSourceFailed,
  afterSourceSwitch,
  noFailedSources,
  sourceHasFailed,
  sourceIdSchema,
  switchSourceSchema,
} from "./sourceFallback";
import { WATCH_PARTY_SOURCES } from "./sources";

/** The 3-2-1 before both players start. */
export const COUNTDOWN_MS = 3000;

/** What a Viewer watched in a Watch Party: a movie, or one episode of a TV show. */
export interface HistoryEntry {
  title: TitleRef;
  episode: Episode | null;
}

/**
 * Where the Watch Party records what each Viewer watched: their History,
 * and for an episode their episode progress too. The server's writes to the
 * database (`server/utils/watchPartyHistory.ts`); a fake in tests.
 * Recording must never hold up or break the Watch Party: the port deals
 * with its own failures, and a rejection is only logged.
 */
export interface HistoryPort {
  record(viewer: Viewer, entry: HistoryEntry): void | Promise<void>;
}

export interface WatchPartyOptions {
  /** The Syncable Sources a Watch Party uses, best first; by default, every one with an adapter. */
  sources?: readonly SourceId[];
  history: HistoryPort;
}

/** Ids go into Postgres `integer` columns (History, episode progress). */
const PG_INT_MAX = 2_147_483_647;

const startSchema = z
  .object({
    type: z.literal("watchParty:start"),
    title: titleRefSchema.extend({ tmdbId: z.number().int().positive().max(PG_INT_MAX) }),
    episode: episodeSchema.nullable(),
    replacing: z.string().max(100).nullable(),
  })
  // A movie has no episode; a TV show is always watched one episode at a time.
  .refine(({ title, episode }) => (title.contentType === WatchPlaylistItemType.MOVIE) === (episode === null));

/** An intent about one Watch Party, which is ignored once that Watch Party is gone. */
function partyIntentSchema<T extends string>(type: T) {
  return z.object({ type: z.literal(type), partyId: z.string().max(100) });
}

const playerStatusSchema = z.object({
  type: z.literal("watchParty:player"),
  partyId: z.string().max(100),
  status: z.enum(["ready", "failed"]),
  episode: episodeSchema.nullable(),
  source: sourceIdSchema,
});

const changeEpisodeSchema = partyIntentSchema("watchParty:episode").extend({ episode: episodeSchema });

/**
 * The intents any device of a Viewer may send: starting a Watch Party,
 * joining or taking it over, and cancelling (`mayEnd` has its own rule).
 * Every other Watch Party intent (the player's status, playback) counts only
 * from the device the Viewer takes part from: see `onlyFromActiveDevices`.
 */
const FROM_ANY_DEVICE: ReadonlySet<DeviceMessageType> = new Set([
  "watchParty:start",
  "watchParty:join",
  "watchParty:takeOver",
  "watchParty:cancel",
]);

export function watchParty({ sources = WATCH_PARTY_SOURCES, history }: WatchPartyOptions): FeatureFactory {
  if (sources.length === 0) throw new Error("A Watch Party needs at least one Syncable Source.");

  /** Both Viewers now watch the Watch Party's Title: record it for each. */
  function recordForBoth({ title, episode }: WatchPartyState) {
    for (const viewer of VIEWERS) {
      const failed = (error: unknown) => console.error(`Failed to record ${viewer}'s Watch Party History`, error);
      try {
        Promise.resolve(history.record(viewer, { title, episode })).catch(failed);
      } catch (error) {
        failed(error);
      }
    }
  }

  return (context) => {
    let party: WatchPartyState | null = null;
    /** The devices whose player has the current Watch Party's Title loaded. */
    let readyDevices = new Set<DeviceId>();
    let seq = 0;
    let partyCount = 0;

    /** Tells every device about the change, numbered after every earlier one. */
    function publish(next: Omit<WatchPartyState, "seq">) {
      party = { ...next, seq: ++seq };
      for (const device of context.devices()) {
        context.send(device.id, { type: "watchParty", party });
      }
    }

    /** Ends the Watch Party for both Viewers; devices hear why, then it is gone. */
    function end(reason: WatchPartyEndReason, by: Viewer) {
      if (!party) return;
      publish({ ...party, phase: { name: "ended", reason, by }, lastChangeBy: by });
      party = null;
      readyDevices = new Set();
    }

    /**
     * Whether `device` may end the Watch Party: the device a Viewer takes
     * part from, or, while it still waits, any device of the starter.
     */
    function mayEnd(device: Device, current: WatchPartyState) {
      if (current.activeDevices[device.viewer] === device.id) return true;
      return current.phase.name === "inviting" && device.viewer === current.starter;
    }

    /**
     * A Viewer who takes part from one device joins from `device`, which
     * becomes their active device. The device it took over from sees that in
     * the shared state and stops its player. Playback goes on undisturbed:
     * the new device's player starts at the shared position.
     */
    function takeOver(device: Device, current: WatchPartyState) {
      const previous = current.activeDevices[device.viewer];
      if (previous === null || previous === device.id) return;
      // The new device's player has yet to load: it reports when it has.
      readyDevices.delete(previous);
      publish({ ...current, activeDevices: { ...current.activeDevices, [device.viewer]: device.id } });
    }

    /**
     * The one guard against devices that do not take part: every intent but
     * those in `FROM_ANY_DEVICE` is ignored unless it comes from its
     * Viewer's active device. So nothing a device sends after another device
     * took over from it (or before its player closed) changes the Watch
     * Party. A new intent is guarded unless listed there.
     */
    function onlyFromActiveDevices(handlers: MessageHandlers): MessageHandlers {
      const guarded: Record<string, MessageHandler<DeviceMessageType>> = {};
      for (const [type, handler] of Object.entries(handlers) as [DeviceMessageType, MessageHandler<DeviceMessageType>][]) {
        guarded[type] = FROM_ANY_DEVICE.has(type)
          ? handler
          : {
              schema: handler.schema,
              handle(from, message) {
                if (party?.activeDevices[from.viewer] === from.id) handler.handle(from, message);
              },
            };
      }
      return guarded as MessageHandlers;
    }

    /** Starts the 3-2-1 once both Viewers' players have loaded the Title. */
    function startCountdownWhenReady() {
      if (party?.phase.name !== "countdown" || party.phase.endsAt !== null) return;
      const active = Object.values(party.activeDevices);
      if (!active.every((device) => device !== null && readyDevices.has(device))) return;
      const endsAt = context.now() + COUNTDOWN_MS;
      publish({
        ...party,
        phase: { name: "countdown", endsAt },
        anchor: { ...party.anchor, serverTime: endsAt, playing: true },
      });
    }

    /**
     * Both Viewers move to another episode: the one `by` chose, or (with
     * `by` null) the next one once its countdown is over. Both players load
     * it anew and report when they have; the 3-2-1 then starts it.
     */
    function moveToEpisode(current: WatchPartyState, episode: Episode, by: Viewer | null) {
      readyDevices = new Set();
      publish({
        ...current,
        ...afterEpisodeChange(current, episode, context.now()),
        // The seq `publish` gives this state.
        ...(by && { lastChangeBy: by, lastChange: { kind: "episode", episode, by, seq: seq + 1 } }),
      });
      recordForBoth({ ...current, episode });
    }

    return {
      connected(device) {
        context.send(device.id, { type: "watchParty", party });
      },

      tick() {
        if (party?.phase.name === "countdown" && party.phase.endsAt !== null && context.now() >= party.phase.endsAt) {
          publish({ ...party, phase: { name: "playing" } });
        }
        if (party?.phase.name === "next-episode" && context.now() >= party.phase.at) {
          moveToEpisode(party, party.phase.next, null);
        }
      },

      handlers: onlyFromActiveDevices({
        "watchParty:start": {
          schema: startSchema satisfies z.ZodType<StartWatchPartyMessage>,
          handle(from, { title, episode, replacing }) {
            if (party) {
              // Only one Watch Party at a time: the Viewer chooses to join it or to replace it.
              if (replacing !== party.id) {
                context.send(from.id, { type: "watchParty:alreadyStarted", party });
                return;
              }
              end("replaced", from.viewer);
            }
            const now = context.now();
            const activeDevices = Object.fromEntries(VIEWERS.map((viewer) => [viewer, null])) as Record<
              Viewer,
              DeviceId | null
            >;
            activeDevices[from.viewer] = from.id;
            readyDevices = new Set();
            publish({
              id: `${now.toString(36)}-${++partyCount}`,
              starter: from.viewer,
              title,
              episode,
              source: sources[0]!,
              ...noFailedSources(),
              mode: "syncable-source",
              phase: { name: "inviting" },
              anchor: { position: 0, serverTime: now, playing: false, rate: 1 },
              lastChangeBy: from.viewer,
              lastChange: null,
              activeDevices,
            });
          },
        },

        "watchParty:join": {
          schema: partyIntentSchema("watchParty:join") satisfies z.ZodType<JoinWatchPartyMessage>,
          handle(from, { partyId }) {
            if (party?.id !== partyId || party.phase.name !== "inviting" || from.viewer === party.starter) return;
            publish({
              ...party,
              phase: { name: "countdown", endsAt: null },
              lastChangeBy: from.viewer,
              activeDevices: { ...party.activeDevices, [from.viewer]: from.id },
            });
            recordForBoth(party);
            startCountdownWhenReady();
          },
        },

        "watchParty:takeOver": {
          schema: partyIntentSchema("watchParty:takeOver") satisfies z.ZodType<TakeOverWatchPartyMessage>,
          handle(from, { partyId }) {
            if (party?.id === partyId) takeOver(from, party);
          },
        },

        "watchParty:player": {
          schema: playerStatusSchema satisfies z.ZodType<PlayerStatusMessage>,
          handle(from, { partyId, status, episode, source }) {
            if (party?.id !== partyId || !sameEpisode(episode, party.episode) || source !== party.source) return;
            if (status === "failed") {
              // Source fallback: both Viewers are offered the next Syncable Source.
              const failed = afterSourceFailed(party, sources);
              if (failed) publish({ ...party, ...failed });
              return;
            }
            if (sourceHasFailed(party)) return;
            readyDevices.add(from.id);
            startCountdownWhenReady();
          },
        },

        "watchParty:cancel": {
          schema: partyIntentSchema("watchParty:cancel") satisfies z.ZodType<CancelWatchPartyMessage>,
          handle(from, { partyId }) {
            if (party?.id === partyId && mayEnd(from, party)) end("cancelled", from.viewer);
          },
        },

        // Shared controls: play, pause, seek or speed (from the active device, as `onlyFromActiveDevices` ensures).
        "watchParty:playback": {
          schema: playbackSchema,
          handle(from, { partyId, change }) {
            if (party?.id !== partyId || !takesPlaybackChanges(party.phase)) return;
            publish({
              ...party,
              ...afterPlaybackChange(party, change, context.now()),
              lastChangeBy: from.viewer,
              // The seq `publish` gives this state.
              lastChange: { ...change, by: from.viewer, seq: seq + 1 },
            });
          },
        },

        // Shared controls: another episode, once both Viewers are in (while it waits, the starter starts anew).
        "watchParty:episode": {
          schema: changeEpisodeSchema satisfies z.ZodType<ChangeEpisodeMessage>,
          handle(from, { partyId, episode }) {
            if (party?.id !== partyId || party.phase.name === "inviting" || party.episode === null) return;
            if (!sameEpisode(episode, party.episode)) moveToEpisode(party, episode, from.viewer);
          },
        },

        // The player reached the end: "Next episode in 10s" for both (`./ending.ts`), or, after a
        // movie or the show's final episode, the Watch Party is over.
        "watchParty:ended": {
          schema: titleEndedSchema,
          handle(from, { partyId, episode, position, next }) {
            if (party?.id !== partyId || !takesPlaybackChanges(party.phase) || !sameEpisode(episode, party.episode)) return;
            if (party.episode && next) publish({ ...party, ...afterEpisodeEnded(party, position, next, context.now()) });
            else end("finished", from.viewer);
          },
        },

        // "Cancel" on "Next episode in 10s": both stay at the end of the episode, paused.
        "watchParty:cancelNext": {
          schema: partyIntentSchema("watchParty:cancelNext") satisfies z.ZodType<CancelNextEpisodeMessage>,
          handle(from, { partyId }) {
            if (party?.id !== partyId || party.phase.name !== "next-episode") return;
            publish({
              ...party,
              phase: { name: "paused" },
              lastChangeBy: from.viewer,
              // The seq `publish` gives this state.
              lastChange: { kind: "next-cancelled", by: from.viewer, seq: seq + 1 },
            });
          },
        },

        // The Viewer closed the player: the other keeps watching alone or stops (while it waits: cancelled).
        "watchParty:leave": {
          schema: partyIntentSchema("watchParty:leave") satisfies z.ZodType<LeaveWatchPartyMessage>,
          handle(from, { partyId }) {
            if (party?.id === partyId) end(party.phase.name === "inviting" ? "cancelled" : "left", from.viewer);
          },
        },

        // Source fallback: another Syncable Source, the one offered or any other.
        "watchParty:source": {
          schema: switchSourceSchema,
          handle(from, { partyId, source }) {
            if (party?.id !== partyId || source === party.source || !sources.includes(source)) return;
            // Both players load the new Source, and report when they have.
            readyDevices = new Set();
            publish({
              ...party,
              ...afterSourceSwitch(party, source, context.now()),
              lastChangeBy: from.viewer,
              // The seq `publish` gives this state.
              lastChange: { kind: "source", source, by: from.viewer, seq: seq + 1 },
            });
          },
        },
      }),
    };
  };
}
