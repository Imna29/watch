# watch

A private Nuxt 4 single-page app where Giorgi and Mariam browse movies and TV
shows (TMDB metadata), each signing in with their own password, with their own
playlists and watched-episode tracking.

## Setup

1. `bun install`
2. Copy `.env.example` to `.env`. The `DB_*` values already match the local
   Docker Postgres; fill in the rest. Set each Viewer's password hash with
   `bun run hash-password --viewer giorgi` and `--viewer mariam`, with
   different passwords (it refuses the other Viewer's once their hash is in `.env`).
3. Start the local Postgres and create the schema:
   `docker compose -f compose.dev.yaml up -d --wait` then `bun run db:migrate`
4. `bun run dev`, open http://localhost:3000 and sign in with either password

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
| Hash a Viewer's password | `bun run hash-password --viewer giorgi` (or `mariam`) |

Database schema lives in `server/database/`; migrations in `drizzle/` are
generated with `bun run db:generate` and applied with `bun run db:migrate`.

## Self-hosting

`compose.yaml` runs the whole site with Docker Compose: the app, Postgres,
Caddy for HTTPS and coturn as the Call's relay. Fill in `.env` (including the
self-hosted stack section of `.env.example`), then run
`docker compose up -d --build --wait`. See "Self-hosting" in `AGENTS.md` for
what the server needs (a domain and open ports).

See `AGENTS.md` for the project layout and conventions.
