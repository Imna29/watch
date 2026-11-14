/**
 * The change message the other Viewer sees over the player ("Mariam paused
 * at 1:02:14"). Framework-free: `<WatchPartyPlayer>` shows it, and seam 1
 * tests read it.
 */
import { VIEWER_NAMES } from "../../models/Viewer";
import type { WatchPartyChange } from "./protocol";

export function describeChange(change: WatchPartyChange): string {
  const who = VIEWER_NAMES[change.by];
  switch (change.kind) {
    case "play":
      return `${who} resumed at ${formatPosition(change.position)}`;
    case "pause":
      return `${who} paused at ${formatPosition(change.position)}`;
    case "seek":
      return `${who} jumped to ${formatPosition(change.position)}`;
    case "rate":
      return `${who} changed the speed to ${change.rate}×`;
    case "episode":
      return `${who} switched to S${change.episode.season}E${change.episode.episode}`;
  }
}

/** 1:02:14 an hour or more in, 5:07 before that. */
export function formatPosition(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}
