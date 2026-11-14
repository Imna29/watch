# The app's image for the self-hosted stack (compose.yaml, ADR 0003): the
# Nitro `bun` preset's standalone server, plus migrate.mjs, which applies
# drizzle/ and which the one-shot `migrate` service runs before the app starts.
# .dockerignore keeps .env and local build output out of the build.

FROM oven/bun:1.4.4-slim AS build
WORKDIR /src
COPY package.json bun.lock ./
# The postinstall `nuxt prepare` needs the sources; `nuxt build` prepares anyway.
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build \
 && bun build scripts/migrate.ts --target=bun --outfile=dist/migrate.mjs

FROM oven/bun:1.4.4-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
# .output is self-contained: the server bundles or traces its dependencies.
COPY --from=build /src/.output ./
COPY --from=build /src/dist/migrate.mjs ./
COPY --from=build /src/drizzle ./drizzle
USER bun
EXPOSE 3000
CMD ["bun", "server/index.mjs"]
