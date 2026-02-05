import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../server/database/db";
import * as schema from "../server/database/schema";
import { watchPlaylists } from "../server/database/watch-schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const now = new Date();
          await db.insert(watchPlaylists).values([
            {
              userId: user.id,
              name: "History",
              type: "HISTORY",
              createdAt: now,
              updatedAt: now,
            },
            {
              userId: user.id,
              name: "Watch Later",
              type: "WATCH_LATER",
              createdAt: now,
              updatedAt: now,
            },
            {
              userId: user.id,
              name: "Favorites",
              type: "FAVORITES",
              createdAt: now,
              updatedAt: now,
            },
          ]);
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});
