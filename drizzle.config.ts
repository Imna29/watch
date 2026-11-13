import { defineConfig } from "drizzle-kit";
import { postgresConnectionOptions } from "./server/database/connection";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/database/schema.ts",
  out: "./drizzle",
  dbCredentials: postgresConnectionOptions(process.env),
});
