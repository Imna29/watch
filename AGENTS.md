# Agent guide

## What this is
A Nuxt 4 single-page app (`ssr: false`) for browsing movies and TV shows via
TMDB, private to two Viewers (Giorgi and Mariam, see `GLOSSARY.md`), with
per-Viewer playlists and watched-episode tracking.

## Stack
- Nuxt 4, Vue 3 `<script setup lang="ts">`, PrimeVue 4 components, Tailwind 4
- Client data fetching: `@tanstack/vue-query` composables in `composables/queries/`
- Server: Nitro routes in `server/api/`, Drizzle ORM + Postgres (`server/database/`)
- Hosting: self-hosted (ADR 0003). Nitro's `bun` preset builds a standalone
  server that runs on Bun (`Bun.serve`, so Nitro WebSockets use Bun's native support)
- Sign-in: one password per Viewer, no accounts (ADR 0001, see "Signing in")
- Package manager: **bun** (do not use npm/pnpm/yarn; `bun.lock` is the lockfile)

## Commands
| Purpose | Command |
|---|---|
| Install | `bun install` |
| Dev server | `bun run dev` |
| Unit tests | `bun run test` |
| Typecheck | `bun run typecheck` |
| Production build | `bun run build` |
| Run the production build | `bun run start` |
| Local Postgres up / down | `docker compose -f compose.dev.yaml up -d --wait` / `... down` (`-v` wipes data) |
| Hash a Viewer's password | `bun run hash-password` |

Typecheck baseline: 2 pre-existing `error TS` lines. Do not increase it:
`bun run typecheck 2>&1 | grep -c "error TS"` must be ≤ that number after your change.

`typescript` is pinned to 6.x on purpose: `vue-tsc` (used by `nuxt typecheck`)
cannot run on TypeScript 7 yet. Do not bump it to 7 until `vue-tsc` supports it.

## Local database
Development uses the local Docker Postgres from `compose.dev.yaml`. Its
credentials match the `DB_*` values in `.env.example`; copy those into `.env`,
start it (see Commands), then `bun run db:migrate`. `DB_CA` stays empty locally:
the connection uses SSL only when `DB_CA` holds a CA certificate
(`server/database/connection.ts`, shared by the app and `drizzle.config.ts`).
The initial migration seeds each Viewer's History, Watch Later and Favorites.

## Signing in
The password typed on `/sign-in` decides which Viewer you are; a signed cookie
then carries that Viewer for a year. The server refuses to start until `.env`
has both Viewers' password hashes and the cookie secret (see `.env.example`).
- `server/viewer/signIn.ts` owns who is asking: password to Viewer, the cookie,
  throttling and the startup check. Framework-free, tested in
  `tests/server/viewerSignIn.test.ts` with a fake clock.
- `server/middleware/viewer.ts` rejects every API request without a valid
  cookie except `POST /api/sign-in`. WebSocket upgrades bypass Nitro
  middleware: authorize them with
  `useViewerSignIn().readViewer(request.headers.get("cookie"))`.
- `middleware/viewer.global.ts` sends signed-out visitors to `/sign-in`; every
  other page is for a signed-in Viewer.

## Realtime
Presence and the Call (later the Watch Party) run over one WebSocket per Device
(ADR 0003). `realtime/` is framework-free, shared by server, browser and tests,
and imported explicitly. A feature lives in `realtime/<feature>/`:
- `protocol.ts`: its messages, added to the unions in `realtime/protocol.ts`.
- `coordinator.ts`: a `RealtimeFeature` (`realtime/coordinator.ts`), listed in
  `realtime/server.ts`. `server/routes/realtime.ts` is only the transport.
- `device.ts`: its device module, added in `realtime/device.ts`. The device
  client drops messages sent while disconnected, so a module that keeps state
  on the server sends it again on every `welcome`. Vue reaches it through
  `composables/useRealtime.ts` (the Call: `composables/useCall.ts`).
- Tests: seam 1, `tests/realtime/harness` (real coordinator and devices, fake
  network and clock). Assert what devices receive. Code that awaits between
  timers needs `await h.advanceAsync(ms)`.

The Call (`realtime/call/`) is peer-to-peer WebRTC; the coordinator only
relays setup between the two Viewers' Call devices. The browser's media and
`RTCPeerConnection` come in through `CallPlatform` (`realtime/call/platform.ts`):
`browserCallPlatform` in the browser, fakes in seam 1 (`harness/fakeMedia.ts`).
Its UI, `<WatchCall>`, sits in `layouts/watchLayout.vue` and teleports its
tiles into the open player shell (`usePlayerOverlayHost()`), so they stay
visible in the shell's fullscreen. ICE servers come from
`GET /api/call/ice-servers` (`server/call/relay.ts`: `TURN_HOST`, `TURN_SECRET`).

The Watch Party (`realtime/watchParty/`, ADR 0002) adds two device-side parts:
- `sources/`: one Syncable Source adapter per Source (`postMessage` both ways,
  origins checked against `utils/sources.ts`), listed in `sources/index.ts`.
- `partySync.ts`: on the device that takes part, joins an adapter to the
  connection (`usePartySync` in `composables/useWatchParty.ts`).
The coordinator records History through the `HistoryPort` that
`server/routes/realtime.ts` passes in. Seam 1 runs every Watch Party scenario
once per Syncable Source with an adapter: a new one needs a fake player that
speaks its format in `tests/realtime/harness/fakeSourcePlayers.ts`.

## Safety
- `.env` holds live credentials. Never print, copy, or commit it.
- Point `db:push`, `db:migrate`, `db:studio` and any test data at the local
  Docker Postgres only.

## Layout
- `pages/` routes
- `components/watch/` UI; auto-imported as `<WatchXxx>`
- `composables/queries/*.ts` vue-query options + hooks, re-exported from `composables/index.ts`
  (nested composables are NOT auto-imported unless re-exported there)
- `composables/queryKeys.ts` the single source of query keys
- `utils/watchRepository.ts` thin HTTP client used by the query composables
- `stores/watchStore.ts` Pinia store (search box state)
- `server/api/watch/**` TMDB proxy; `server/api/playlists/**` and
  `server/api/watched-episodes/**` DB-backed, per Viewer
- `server/utils/*.ts` are auto-imported inside `server/`
- `realtime/` the realtime connection, server and device sides (see "Realtime")

## Conventions
- New client reads/writes go through vue-query composables, not direct
  `watchRepository($apiClient)` calls from components.
- Server handlers that touch a Viewer's data start with
  `const viewer = requireViewer(event)` (`giorgi` or `mariam`).
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
