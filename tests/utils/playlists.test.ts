import { describe, expect, it } from "vitest";
import { WatchPlaylistType, type WatchPlaylist } from "../../models/apiModels/watch/Playlist";
import { findPlaylistByType } from "../../utils/playlists";

function playlist(id: string, type: WatchPlaylistType): WatchPlaylist {
  return { id, viewer: "giorgi", name: id, type, createdAt: "", updatedAt: "" };
}

describe("findPlaylistByType", () => {
  const playlists = [
    playlist("h", WatchPlaylistType.HISTORY),
    playlist("w", WatchPlaylistType.WATCH_LATER),
  ];

  it("finds the playlist of the requested type", () => {
    expect(findPlaylistByType(playlists, WatchPlaylistType.WATCH_LATER)?.id).toBe("w");
  });

  it("returns undefined when the user has no playlist of that type", () => {
    expect(findPlaylistByType(playlists, WatchPlaylistType.FAVORITES)).toBeUndefined();
  });

  it("returns undefined for missing playlist data", () => {
    expect(findPlaylistByType(undefined, WatchPlaylistType.HISTORY)).toBeUndefined();
    expect(findPlaylistByType(null, WatchPlaylistType.HISTORY)).toBeUndefined();
    expect(findPlaylistByType([], WatchPlaylistType.HISTORY)).toBeUndefined();
  });
});
