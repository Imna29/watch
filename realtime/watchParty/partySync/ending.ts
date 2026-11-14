/**
 * The end of a Title, on the device that takes part (`../ending.ts` on the
 * server): a player reports "pause" then "ended" at the end, as a `<video>`
 * does. Party sync tells the coordinator, with the episode after it (looked
 * up through the `EpisodeGuide`), keeps the player there, and counts down
 * "Next episode in 10s" while the coordinator does.
 */
import type { Clock, TimerId } from "../../clock";
import type { DeviceClient } from "../../deviceClient";
import type { DeviceWatchParty } from "../device";
import { episodeAfter, type EpisodeGuide } from "../episodeGuide";
import { takesPlaybackChanges, type Episode, type WatchPartyState } from "../protocol";
import type { PlayerModel } from "./player";
import type { ViewStore } from "./view";

/** How close to the end of the Title a player that stops counts as having reached it. */
const END_TOLERANCE_S = 1;

export interface EndingOptions {
  clock: Clock;
  client: DeviceClient;
  watchParty: DeviceWatchParty;
  episodes: EpisodeGuide;
  player: PlayerModel;
  view: ViewStore;
  /** The Watch Party party sync is for, while it goes on; null after. */
  live(): WatchPartyState | null;
}

export function createEnding({ clock, client, watchParty, episodes, player, view, live }: EndingOptions) {
  /** The episode the player has (null: a movie). */
  let loadedEpisode: Episode | null = null;
  /** The loaded Title's length, once the player reported it. */
  let duration: number | null = null;
  /**
   * The player stopped at the end of what it plays. It stays there (nothing
   * to play, no drift to report) until the shared state wants it earlier on.
   */
  let stoppedAtTheEnd = false;
  let nextEpisodeTimer: TimerId | null = null;
  let stopped = false;

  const ending = {
    /** Whether the player stopped at the end of what it plays. */
    get stoppedAtTheEnd() {
      return stoppedAtTheEnd;
    },

    /** The player loads `episode` (null: a movie) anew: it has not reached its end. */
    loaded(episode: Episode | null) {
      loadedEpisode = episode;
      duration = null;
      stoppedAtTheEnd = false;
    },

    /** The player said how long the Title is. */
    heardDuration(seconds: number) {
      duration = seconds;
    },

    /** Whether the player is at the end of the Title. */
    atTheEnd() {
      return duration !== null && player.position() >= duration - END_TOLERANCE_S;
    },

    /**
     * Whether a player that stopped at the end stays there, when the shared
     * state wants it at `position`: the shared state goes on past the end
     * until the coordinator hears it ended.
     */
    staysAtTheEnd(position: number) {
      if (stoppedAtTheEnd && duration !== null && position < duration - END_TOLERANCE_S) stoppedAtTheEnd = false;
      return stoppedAtTheEnd;
    },

    /**
     * The player reached the end of the Title: tells the coordinator, with the
     * episode after it (looked up in the episode guide) for a TV show.
     */
    heardEnded() {
      player.isAt(duration ?? player.position());
      player.paused = true;
      stoppedAtTheEnd = true;
      const party = live();
      if (!party || view.current.player !== "ready" || !takesPlaybackChanges(party.phase)) return;
      const { id, title } = party;
      const episode = loadedEpisode;
      const position = player.position();
      if (!episode) {
        watchParty.titleEnded(id, null, position, null);
        return;
      }
      episodes.episodesOf(title.tmdbId).then(
        (show) => {
          if (!stopped) watchParty.titleEnded(id, episode, position, episodeAfter(show, episode));
        },
        (error: unknown) =>
          console.error(`Could not look up the episode after S${episode.season}E${episode.episode}`, error),
      );
    },

    /** "Next episode in 10s": counts the seconds until both move on, on the server's clock. */
    showNextEpisode() {
      if (nextEpisodeTimer !== null) clock.clearTimeout(nextEpisodeTimer);
      nextEpisodeTimer = null;
      const phase = live()?.phase;
      if (phase?.name !== "next-episode") {
        view.set({ nextEpisode: null });
        return;
      }
      const remaining = phase.at - client.serverNow();
      const secondsLeft = Math.max(0, Math.ceil(remaining / 1000));
      const shown = view.current.nextEpisode;
      if (shown?.episode !== phase.next || shown.secondsLeft !== secondsLeft) {
        view.set({ nextEpisode: { episode: phase.next, secondsLeft } });
      }
      if (secondsLeft > 0) {
        nextEpisodeTimer = clock.setTimeout(ending.showNextEpisode, remaining - (secondsLeft - 1) * 1000);
      }
    },

    stop() {
      stopped = true;
      if (nextEpisodeTimer !== null) clock.clearTimeout(nextEpisodeTimer);
    },
  };
  return ending;
}
