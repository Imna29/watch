# Agent guide

## What this is
A Nuxt 4 single-page app (`ssr: false`) for browsing movies and TV shows via
TMDB, with email/password accounts, playlists and watched-episode tracking.

## Stack
- Nuxt 4, Vue 3 `<script setup lang="ts">`, PrimeVue 4 components, Tailwind 4
- Client data fetching: `@tanstack/vue-query` composables in `composables/queries/`
- Server: Nitro routes in `server/api/`, Drizzle ORM + Postgres (`server/database/`)
- Auth: `better-auth` (`lib/auth.ts`, `server/utils/auth.ts`, `composables/auth.ts`)
- Package manager: **bun** (do not use npm/pnpm/yarn; `bun.lock` is the lockfile)

## Commands
| Purpose | Command |
|---|---|
| Install | `bun install` |
| Dev server | `bun run dev` |
| Unit tests | `bun run test` |
| Typecheck | `bun run typecheck` |
| Production build | `bun run build` |

Typecheck baseline: 2 pre-existing `error TS` lines. Do not increase it:
`bun run typecheck 2>&1 | grep -c "error TS"` must be ≤ that number after your change.

`typescript` is pinned to 6.x on purpose: `vue-tsc` (used by `nuxt typecheck`)
cannot run on TypeScript 7 yet. Do not bump it to 7 until `vue-tsc` supports it.

## Safety
- `.env` holds live credentials. Never print, copy, or commit it.
- The database in `.env` may be production. Never run `db:push`, `db:migrate`
  or `db:studio`, and do not create test users through the dev server, unless
  the operator has confirmed the database is disposable.

## Layout
- `pages/` routes; every page sets `definePageMeta({ auth: ... })` (see `middleware/auth.global.ts`)
- `components/watch/` UI; auto-imported as `<WatchXxx>`
- `composables/queries/*.ts` vue-query options + hooks, re-exported from `composables/index.ts`
  (nested composables are NOT auto-imported unless re-exported there)
- `composables/queryKeys.ts` the single source of query keys
- `utils/watchRepository.ts` thin HTTP client used by the query composables
- `stores/watchStore.ts` Pinia store (search box state)
- `server/api/watch/**` unauthenticated TMDB proxy; `server/api/playlists/**` and
  `server/api/watched-episodes/**` authenticated, DB-backed
- `server/utils/*.ts` are auto-imported inside `server/`

## Conventions
- New client reads/writes go through vue-query composables, not direct
  `watchRepository($apiClient)` calls from components.
- Server handlers call `requireAuthSession(event)` first when they touch user data.
- Tests live in `tests/**` and run in plain Node: they can only import modules
  that do not depend on Nuxt auto-imports at runtime.
- Commit messages: conventional commits (`fix: ...`, `chore: ...`).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `Imna29/watch`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels, each named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
