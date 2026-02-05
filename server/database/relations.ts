import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

// Define relations for relational queries
export const relations = defineRelations(schema, (r) => ({
  // User relations
  user: {
    sessions: r.many.session({
      from: r.user.id,
      to: r.session.userId,
    }),
    accounts: r.many.account({
      from: r.user.id,
      to: r.account.userId,
    }),
    playlists: r.many.watchPlaylists({
      from: r.user.id,
      to: r.watchPlaylists.userId,
    }),
    watchedEpisodes: r.many.watchedEpisodes({
      from: r.user.id,
      to: r.watchedEpisodes.userId,
    }),
  },
  // Session relations
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  // Account relations
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  // Watch Playlist relations
  watchPlaylists: {
    user: r.one.user({
      from: r.watchPlaylists.userId,
      to: r.user.id,
    }),
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
  // Watched Episodes relations
  watchedEpisodes: {
    user: r.one.user({
      from: r.watchedEpisodes.userId,
      to: r.user.id,
    }),
  },
}));
