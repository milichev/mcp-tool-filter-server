# syntax=docker/dockerfile:1
FROM node:25-slim AS build
WORKDIR /app

# Install build-essential if any native deps need compilation (usually not for sharp/onnx)
# RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build-cli

FROM node:25-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Declare ARGs for build-time propagation
ARG LOG_LEVEL=info
ARG UPSTREAM_MCP_TRANSPORT=stdio
ARG UPSTREAM_MCP_URL=
ARG UPSTREAM_MCP_COMMAND=
ARG UPSTREAM_MCP_ARGS=
ARG UPSTREAM_MCP_ENV=
ARG UPSTREAM_MCP_CWD=

ARG PROXY_MCP_TRANSPORT=stdio
ARG PROXY_MCP_PORT=3129

ARG EMBEDDING_PROVIDER=local

# Convert ARGs to ENVs so they persist at runtime
ENV LOG_LEVEL=${LOG_LEVEL} \
    UPSTREAM_MCP_TRANSPORT=${UPSTREAM_MCP_TRANSPORT} \
    UPSTREAM_MCP_URL=${UPSTREAM_MCP_URL} \
    UPSTREAM_MCP_COMMAND=${UPSTREAM_MCP_COMMAND} \
    UPSTREAM_MCP_ARGS=${UPSTREAM_MCP_ARGS} \
    UPSTREAM_MCP_ENV=${UPSTREAM_MCP_ENV} \
    UPSTREAM_MCP_CWD=${UPSTREAM_MCP_CWD} \
    PROXY_MCP_TRANSPORT=${PROXY_MCP_TRANSPORT} \
    PROXY_MCP_PORT=${PROXY_MCP_PORT} \
    EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER}

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts=false

COPY --from=build /app/bin/mcp-tool-filter-server.mjs ./bin/mcp-tool-filter-server.mjs
COPY upstream/* ./upstream/

EXPOSE ${PROXY_MCP_PORT}
ENTRYPOINT ["node", "bin/mcp-tool-filter-server.mjs"]
