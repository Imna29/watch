export enum WatchPlaylistType {
  HISTORY = "HISTORY",
  WATCH_LATER = "WATCH_LATER",
  FAVORITES = "FAVORITES",
  CUSTOM = "CUSTOM",
}

export enum WatchPlaylistItemType {
  MOVIE = "MOVIE",
  TV_SHOW = "TV_SHOW",
}

export interface WatchPlaylist {
  id: string;
  userId: string;
  name: string;
  type: WatchPlaylistType;
  createdAt: string;
  updatedAt: string;
  items?: WatchPlaylistItem[];
}

export interface WatchPlaylistItem {
  id: string;
  playlistId: string;
  contentType: WatchPlaylistItemType;
  contentId: number;
  addedAt: string;
}

export interface WatchPlaylistWithItems extends WatchPlaylist {
  items: WatchPlaylistItem[];
}
