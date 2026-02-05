import {
  pgTable,
  uuid,
  timestamp,
  text,
  integer,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Enums
export const watchPlaylistItemTypeEnum = pgEnum(
  "watch_playlist_item_type",
  ["MOVIE", "TV_SHOW"]
);

export const watchPlaylistTypeEnum = pgEnum("watch_playlist_type", [
  "HISTORY",
  "WATCH_LATER",
  "FAVORITES",
  "CUSTOM",
]);

// Watch Playlist table
export const watchPlaylists = pgTable(
  "watch_playlists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: watchPlaylistTypeEnum("type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
  },
  (table) => [index("watch_playlists_user_id_idx").on(table.userId)]
);

// Watch Playlist Items table
export const watchPlaylistItems = pgTable(
  "watch_playlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => watchPlaylists.id, { onDelete: "cascade" }),
    contentType: watchPlaylistItemTypeEnum("content_type").notNull(),
    contentId: integer("content_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    watchedAt: timestamp("watched_at", { mode: "date" }).notNull(),
  },
  (table) => [
    unique("watch_playlist_items_unique_idx").on(
      table.playlistId,
      table.contentType,
      table.contentId
    ),
    index("watch_playlist_items_playlist_id_idx").on(table.playlistId),
  ]
);

// Watched Episodes table
export const watchedEpisodes = pgTable(
  "watched_episodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    seasonNum: integer("season_num").notNull(),
    episodeNum: integer("episode_num").notNull(),
    tvShowId: integer("tv_show_id").notNull(),
    watchedAt: timestamp("watched_at", { mode: "date" }).notNull(),
  },
  (table) => [
    unique("watched_episodes_unique_idx").on(
      table.userId,
      table.tvShowId,
      table.seasonNum,
      table.episodeNum
    ),
    index("watched_episodes_user_tvshow_idx").on(
      table.userId,
      table.tvShowId
    ),
  ]
);
