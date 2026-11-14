/**
 * Echo suppression. A Source's player reports the commands party sync gives
 * it ("play", "pause", "seeked", "ratechange") exactly as it reports the
 * Viewer's own presses, so party sync notes what each command will report.
 * A report that matches is an echo, never sent on as the Viewer's change.
 * Every command party sync gives the player must be noted here.
 */
import type { Clock } from "../../clock";
import type { PlayerEvent } from "../sources/adapter";
import { SEEK_TOLERANCE_S } from "./player";

/** How long a player may take to report a command; after that, the command is taken to have done nothing. */
const ECHO_TIMEOUT_MS = 10_000;

/**
 * What the player reports when it carries out one of party sync's commands.
 * `followUp`: a seek meant to land in step with a playing Watch Party, which
 * is made once more if it took so long that it landed behind.
 */
export type Echo =
  | { type: "play" | "pause" }
  | { type: "seeked"; position: number; followUp: boolean }
  | { type: "ratechange"; rate: number };

/** Commands that report on the same thing: a later one decides it. */
function channelOf(type: Echo["type"]) {
  return type === "play" || type === "pause" ? "playing" : type;
}

function matches(echo: Echo, event: PlayerEvent) {
  if (echo.type !== event.type) return false;
  if (echo.type === "seeked" && event.type === "seeked") {
    return Math.abs(echo.position - event.position) <= SEEK_TOLERANCE_S;
  }
  if (echo.type === "ratechange" && event.type === "ratechange") return echo.rate === event.rate;
  return true;
}

export function createEchoes(clock: Clock) {
  let expected: (Echo & { at: number; until: number })[] = [];

  return {
    expect(echo: Echo) {
      const now = clock.now();
      expected.push({ ...echo, at: now, until: now + ECHO_TIMEOUT_MS });
    },

    /**
     * The command `event` echoes; null when it echoes none. The player
     * reports in order, so commands on the same thing given before that one
     * will not be reported any more: they are forgotten too. `latest`: no
     * later command on the same thing is still on its way. `tookMs`: how
     * long the player took to carry it out.
     */
    heard(event: PlayerEvent): { echo: Echo; latest: boolean; tookMs: number } | null {
      const now = clock.now();
      expected = expected.filter((echo) => echo.until > now);
      const index = expected.findIndex((echo) => matches(echo, event));
      if (index === -1) return null;
      const echo = expected[index]!;
      const channel = channelOf(echo.type);
      expected = expected.filter((other, i) => i > index || channelOf(other.type) !== channel);
      return { echo, latest: !expected.some((other) => channelOf(other.type) === channel), tookMs: now - echo.at };
    },

    /** Whether a command that reports `type` is still on its way. */
    awaiting(type: Echo["type"]) {
      const now = clock.now();
      return expected.some((echo) => echo.type === type && echo.until > now);
    },

    clear() {
      expected = [];
    },
  };
}

export type Echoes = ReturnType<typeof createEchoes>;
