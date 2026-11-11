import type { WatchPlaylist, WatchPlaylistType } from "~/models/apiModels/watch/Playlist";

/** Returns the user's playlist of the given type, or undefined if none exists. */
export function findPlaylistByType(
  playlists: WatchPlaylist[] | null | undefined,
  type: WatchPlaylistType,
): WatchPlaylist | undefined {
  return playlists?.find((playlist) => playlist.type === type);
}
