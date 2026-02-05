import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: {
      ca: process.env.DB_CA!,
      rejectUnauthorized: true
    },
  },
});
