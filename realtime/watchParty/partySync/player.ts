/** The Source's player as party sync sees it, between what the player says. */
import type { Clock } from "../../clock";

/** A player this close to where it should be is left alone; further off, it is moved. */
export const SEEK_TOLERANCE_S = 0.5;

/**
 * The player as last heard from it (or as last told: commands count as done
 * until the player says otherwise), on this device's clock. It moves on from
 * where it was last heard, unless it is paused or `stalled` (it stands still
 * although not paused).
 */
export interface PlayerModel {
  paused: boolean;
  rate: number;
  stalled: boolean;
  /** Where the player is now, in seconds. */
  position(): number;
  /** The player is at `position` now (it said so, or was just told to go there), and not stalled. */
  isAt(position: number): void;
  /** The player did not move since it was last heard: it is where it was then, paused. */
  stoodStill(): void;
  /** A new document: the player starts paused at `position`, at normal speed. */
  reset(position: number): void;
  /** How long since the player was last heard (or told) where it is, in milliseconds. */
  silentForMs(): number;
}

export function createPlayerModel(clock: Clock): PlayerModel {
  /** Where the player was last heard to be, and when. */
  let heardAt = 0;
  let heardWhen = clock.now();
  const model: PlayerModel = {
    paused: true,
    rate: 1,
    stalled: false,

    position() {
      if (model.paused || model.stalled) return heardAt;
      return heardAt + ((clock.now() - heardWhen) / 1000) * model.rate;
    },

    isAt(position) {
      heardAt = position;
      heardWhen = clock.now();
      model.stalled = false;
    },

    stoodStill() {
      model.isAt(heardAt);
      model.paused = true;
    },

    reset(position) {
      model.isAt(position);
      model.paused = true;
      model.rate = 1;
    },

    silentForMs() {
      return clock.now() - heardWhen;
    },
  };
  return model;
}
