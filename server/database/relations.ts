import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

// Define relations for relational queries
export const relations = defineRelations(schema, (r) => ({
  // Watch Playlist relations
  watchPlaylists: {
    items: r.many.watchPlaylistItems({
      from: r.watchPlaylists.id,
      to: r.watchPlaylistItems.playlistId,
    }),
  },
  // Watch Playlist Items relations
  watchPlaylistItems: {
    playlist: r.one.watchPlaylists({
      from: r.watchPlaylistItems.playlistId,
      to: r.watchPlaylists.id,
    }),
  },
}));
