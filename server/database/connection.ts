// Shared by the app's pool (db.ts) and drizzle-kit (drizzle.config.ts).
// SSL is used only when DB_CA holds a CA certificate, so the local Docker
// Postgres (compose.dev.yaml) works without one.
export function postgresConnectionOptions(env: Record<string, string | undefined>) {
  return {
    host: env.DB_HOST!,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME!,
    ssl: env.DB_CA ? { ca: env.DB_CA, rejectUnauthorized: true } : false,
  };
}
