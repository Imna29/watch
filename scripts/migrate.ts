// Applies the migrations in drizzle/ to the database in server config (the
// DB_* variables, see server/database/connection.ts), then exits. Migrations
// that were already applied are skipped, so it is safe to run again. It
// records them in the same table as `bun run db:migrate` (drizzle-kit).
//
// The Compose stack's one-shot `migrate` service runs it before the app
// starts (compose.yaml); the Dockerfile bundles it into the image as
// migrate.mjs next to drizzle/. Run it from the directory that holds drizzle/:
//
//   bun scripts/migrate.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { postgresConnectionOptions } from "../server/database/connection";

const pool = new pg.Pool(postgresConnectionOptions(process.env));
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  console.log("Database migrations applied.");
} catch (error) {
  console.error("Database migrations failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
