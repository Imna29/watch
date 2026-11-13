CREATE TYPE "viewer" AS ENUM('giorgi', 'mariam');--> statement-breakpoint
CREATE TYPE "watch_playlist_item_type" AS ENUM('MOVIE', 'TV_SHOW');--> statement-breakpoint
CREATE TYPE "watch_playlist_type" AS ENUM('HISTORY', 'WATCH_LATER', 'FAVORITES', 'CUSTOM');--> statement-breakpoint
CREATE TABLE "watch_playlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"playlist_id" uuid NOT NULL,
	"content_type" "watch_playlist_item_type" NOT NULL,
	"content_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"watched_at" timestamp NOT NULL,
	CONSTRAINT "watch_playlist_items_unique_idx" UNIQUE("playlist_id","content_type","content_id")
);
--> statement-breakpoint
CREATE TABLE "watch_playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"viewer" "viewer" NOT NULL,
	"name" text NOT NULL,
	"type" "watch_playlist_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watched_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"viewer" "viewer" NOT NULL,
	"season_num" integer NOT NULL,
	"episode_num" integer NOT NULL,
	"tv_show_id" integer NOT NULL,
	"watched_at" timestamp NOT NULL,
	CONSTRAINT "watched_episodes_unique_idx" UNIQUE("viewer","tv_show_id","season_num","episode_num")
);
--> statement-breakpoint
CREATE INDEX "watch_playlist_items_playlist_id_idx" ON "watch_playlist_items" ("playlist_id");--> statement-breakpoint
CREATE INDEX "watch_playlists_viewer_idx" ON "watch_playlists" ("viewer");--> statement-breakpoint
CREATE INDEX "watched_episodes_viewer_tvshow_idx" ON "watched_episodes" ("viewer","tv_show_id");--> statement-breakpoint
ALTER TABLE "watch_playlist_items" ADD CONSTRAINT "watch_playlist_items_playlist_id_watch_playlists_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "watch_playlists"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Seed: each Viewer's system playlists (ADR 0001: no sign-up creates them).
INSERT INTO "watch_playlists" ("viewer", "name", "type", "updated_at") VALUES
	('giorgi', 'History', 'HISTORY', now()),
	('giorgi', 'Watch Later', 'WATCH_LATER', now()),
	('giorgi', 'Favorites', 'FAVORITES', now()),
	('mariam', 'History', 'HISTORY', now()),
	('mariam', 'Watch Later', 'WATCH_LATER', now()),
	('mariam', 'Favorites', 'FAVORITES', now());
