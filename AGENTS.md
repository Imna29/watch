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
| Self-hosted stack up / down | `docker compose up -d --build --wait` / `docker compose down` (see "Self-hosting") |

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
Presence, the Watch Party and the Call run over one WebSocket per Device
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
  origins checked against `utils/sources.ts`), listed in `sources/index.ts`:
  CineSrc, then VidFast. A factory states `canSetRate` (VidFast: no speed
  command), which the coordinator reads through `canSetRate()`.
- `partySync.ts`: on the device that takes part, joins an adapter to the
  connection (`usePartySync` in `composables/useWatchParty.ts`).
Each Viewer takes part from one active device, the newest they joined from.
The coordinator handles an intent only from that device, unless
`FROM_ANY_DEVICE` (`coordinator.ts`) lists it: list there an intent any
device of a Viewer may send.
Shared controls: party sync turns a Viewer's play, pause, seek or speed in
the Source's own player into a `watchParty:playback` intent
(`sharedControls.ts` on the server), and every command it gives the player
is noted as an expected echo (`createEchoes` in `partySync.ts`), so the
player's report of it is never sent back. A new command party sync gives
must be noted the same way. Devices drop a state whose `seq` is older than
one they have.
Source fallback (`sourceFallback.ts` on the server): party sync reports a
Source that cannot play the Title (`watchParty:player`, status "failed").
The coordinator adds it to the state's `failedSources` and offers both
Viewers its `fallback`: the next Syncable Source, or `tab-share` once none
is left. `watchParty:source` switches both players to a Source at the
current position. Another episode clears `failedSources`.
The end of a Title (`ending.ts` on the server): a player reports "pause"
then "ended" at the end, as a `<video>` does; party sync drops that pause
(adapters pass `duration` on with "timeupdate") and sends
`watchParty:ended` with the episode after it. The device looks that up
through the `EpisodeGuide` port (`episodeGuide.ts`: the TV show query in
`usePartySync`, `shows` in the harness); the coordinator never fetches
TMDB. It then runs the `next-episode` phase ("Next episode in 10s", cancel
with `watchParty:cancelNext`) and moves both through the same path as a
chosen episode; after a movie or the last aired episode it ends the Watch
Party ("finished"). Closing the player sends `watchParty:leave`: the Watch
Party ends ("left") and the other device keeps its player open
(`playerParty`, `left` in `device.ts`) to "Keep watching alone / Stop".
Party sync stays bound to the Watch Party it opened for.
The coordinator records History through the `HistoryPort` that
`server/routes/realtime.ts` passes in. Seam 1 runs every Watch Party scenario
once per Syncable Source with an adapter: a new one needs a fake player that
speaks its format in `tests/realtime/harness/fakeSourcePlayers.ts`.

## Self-hosting
`compose.yaml` runs the whole site on one machine (ADR 0003). Its settings
come from `.env` next to it: the variables in `.env.example`, including the
"self-hosted stack" section at its end. Services:
- `app`: the image from `Dockerfile` (the `bun` preset's `.output`). It has no
  published port: only Caddy reaches it, since the sign-in throttle trusts
  `X-Forwarded-For`.
- `migrate`: a one-shot run of the same image that applies `drizzle/`
  (`scripts/migrate.ts`, bundled as `migrate.mjs`). `app` starts only after it
  succeeds.
- `postgres`: data on the `postgres-data` volume, reachable only inside the stack.
- `caddy`: HTTPS for `DOMAIN` and the realtime WebSocket (`deploy/Caddyfile`).
  Certificates live on the `caddy-data` volume.
- `coturn`: the Call's relay (`deploy/turnserver.conf`, started by
  `deploy/coturn.sh`). It shares `TURN_SECRET` with the app, and the app's
  `TURN_HOST` defaults to `DOMAIN`.

Run it with `docker compose up -d --build --wait`. Run the same command again
after pulling changes; it rebuilds the image and applies new migrations. Use
`docker compose logs -f app` for logs. `docker compose down -v` deletes the
database.

The VPS needs:
- Docker Engine with the Compose plugin.
- A domain whose DNS A record points straight at the VPS, with no CDN proxy
  in between: browsers reach coturn at that name too.
- These inbound ports open, and no others:
  - 80/tcp: certificates and the redirect to HTTPS
  - 443/tcp and 443/udp: HTTPS and HTTP/3
  - 3478/udp and 3478/tcp: STUN and TURN
  - 49160-49200/udp: the relay range
- `TURN_EXTERNAL_IP` set to its public IPv4 address. If it is left empty,
  coturn looks the address up as it starts.

To run the stack locally, keep its settings in a separate file such as
`.env.stack` (gitignored). Use `DOMAIN=localhost` and `TURN_EXTERNAL_IP=127.0.0.1`,
and if 80, 443 or 3478 are taken, set `HTTP_PORT`, `HTTPS_PORT` and `TURN_PORT`.
Start it with `docker compose -p watch-local --env-file .env.stack up -d --build --wait`,
then open `https://localhost:<HTTPS_PORT>` in two browser profiles, one per
Viewer. Caddy signs `localhost` with its own CA. Trust its root
(`docker compose ... cp caddy:/data/caddy/pki/authorities/local/root.crt .`)
or accept the browser's warning. Pages that call TMDB need a real
`TMDB_API_KEY`.

## Safety
- `.env` holds live credentials. Never print, copy, or commit it.
- Point `db:push`, `db:migrate`, `db:studio` and any test data at the local
  Docker Postgres only.
- Never run `docker compose down -v` against the VPS's stack: it deletes the
  database and Caddy's certificates.

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
