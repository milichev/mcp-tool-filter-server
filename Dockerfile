# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────
# Stage 1: build
# ─────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json instructions.md ./
COPY src ./src
COPY scripts ./scripts

RUN pnpm exec tsc --noEmit && node scripts/build-cli.js

# ─────────────────────────────────────────────
# Stage 2: runtime
#
# @xenova/transformers statically imports onnxruntime-node and sharp.
# Both ship platform-specific native binaries that must match the runtime OS/arch.
# We install them directly with npm (not pnpm) so postinstall scripts run and
# download the correct prebuilt binaries for the container platform.
# ─────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

# Install JS deps via pnpm (no native postinstall needed for pure-JS packages)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --shamefully-hoist --ignore-scripts

# Re-install native deps via npm so their postinstall scripts run and fetch
# the correct platform binaries for this container's OS/arch.
RUN npm install --no-save --ignore-scripts=false \
    onnxruntime-node@1.14.0 \
    onnxruntime-node@1.24.3 \
    sharp

COPY --from=build /app/bin/cli.mjs ./bin/cli.mjs
COPY upstream/cli.mjs ./upstream/cli.mjs

# ── anytype-mcp upstream env vars ────────────────────────────────────────────
ENV OPENAPI_MCP_HEADERS="" \
    ANYTYPE_API_BASE_URL="" \
    MCP_PASSTHROUGH_HEADERS="" \
    MCP_INSTRUCTIONS="" \
    DISCOVERY_TOOL_CONFIG=""

# ── filter proxy config ───────────────────────────────────────────────────────
ENV UPSTREAM_MCP_TRANSPORT=stdio \
    UPSTREAM_MCP_COMMAND=node \
    UPSTREAM_MCP_ARGS=./upstream/cli.mjs \
    PROXY_MCP_TRANSPORT=http \
    PROXY_MCP_PORT=3000 \
    EMBEDDING_PROVIDER=local

EXPOSE 3000

ENTRYPOINT ["node", "bin/cli.mjs"]
