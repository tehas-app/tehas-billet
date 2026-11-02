# The preview of a pull request: the server serves the built page, with SQLite
# in the container. The build context is the repository root.
FROM rust:1.99.1-slim-bookworm@sha256:24707e70a4f1e23d9a7b25202ec43126d28a52294b96aad5c670df1fd1f1d400 AS addon
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
RUN cargo build --release --locked -p example

FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d AS web
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund
RUN node node_modules/vite/bin/vite.js build packages/web

FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages packages
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22.22.1-bookworm-slim@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d
WORKDIR /app
COPY --from=deps /app ./
COPY --from=web /app/packages/web/dist packages/web/dist
COPY --from=addon /src/target/release/libexample.so crates/example/example.node
COPY migrations migrations
# A preview's root is read-only and /data is writable, so the default database
# file lands there. The server finds its own files from where its source lies.
# The tmpfs over /data keeps this mode but not an owner, hence the 1777.
RUN mkdir -m 1777 /data
WORKDIR /data
USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "/app/packages/server/src/main.ts"]
