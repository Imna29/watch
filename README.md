# watch

A Nuxt 4 single-page app for browsing movies and TV shows (TMDB metadata) with
accounts, playlists and watched-episode tracking.

## Setup

1. `bun install`
2. Copy `.env.example` to `.env` and fill in every variable.
3. `bun run dev` and open http://localhost:3000

## Commands

| Purpose | Command |
|---|---|
| Dev server | `bun run dev` |
| Unit tests | `bun run test` |
| Typecheck | `bun run typecheck` |
| Production build | `bun run build` |
| Preview build | `bun run preview` |

Database schema lives in `server/database/`; migrations in `drizzle/` are
generated with `bun run db:generate` and applied with `bun run db:migrate`.

See `AGENTS.md` for the project layout and conventions.
