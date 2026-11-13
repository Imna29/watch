# watch

A Nuxt 4 single-page app for browsing movies and TV shows (TMDB metadata) with
accounts, playlists and watched-episode tracking.

## Setup

1. `bun install`
2. Copy `.env.example` to `.env`. The `DB_*` values already match the local
   Docker Postgres; fill in the rest.
3. Start the local Postgres and create the schema:
   `docker compose -f compose.dev.yaml up -d --wait` then `bun run db:migrate`
4. `bun run dev` and open http://localhost:3000

## Commands

| Purpose | Command |
|---|---|
| Dev server | `bun run dev` |
| Unit tests | `bun run test` |
| Typecheck | `bun run typecheck` |
| Production build | `bun run build` |
| Preview build | `bun run preview` |
| Run the production build (Bun) | `bun run start` |
| Stop the local Postgres | `docker compose -f compose.dev.yaml down` (`-v` wipes data) |

Database schema lives in `server/database/`; migrations in `drizzle/` are
generated with `bun run db:generate` and applied with `bun run db:migrate`.

See `AGENTS.md` for the project layout and conventions.
