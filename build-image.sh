#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
IMAGE_NAME="${IMAGE_NAME:-mcp-tool-filter-server}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
UPSTREAM_DIR="./upstream"
mkdir -p "$SCRIPT_DIR/$UPSTREAM_DIR"

# 1. Resolve Upstream Source (The only required local file)
if [[ -z "${UPSTREAM_SOURCE:-}" ]]; then
  read -p "Enter absolute path to upstream JS bundle (cli.mjs/index.js): " UPSTREAM_SOURCE
fi

if [[ ! -f "${UPSTREAM_SOURCE}" ]]; then
  echo "ERROR: Upstream source not found at ${UPSTREAM_SOURCE}"
  exit 1
fi

cp "${UPSTREAM_SOURCE}" "$UPSTREAM_DIR"

# 2. Collect Environment Variables to Propagate
# Add any keys here you want to "bake" into the image if set in shell
VARS_TO_PROPAGATE=(
  NODE_ENV LOG_LEVEL UPSTREAM_MCP_TRANSPORT UPSTREAM_MCP_URL
  UPSTREAM_MCP_COMMAND UPSTREAM_MCP_ARGS UPSTREAM_MCP_ENV UPSTREAM_MCP_CWD
  PROXY_MCP_TRANSPORT PROXY_MCP_PORT EMBEDDING_PROVIDER EMBEDDING_MODEL
  EMBEDDING_QUANTIZED EMBEDDING_API_KEY EMBEDDING_DIMENSIONS EMBEDDING_BASE_URL
  FILTER_TOP_K FILTER_MIN_SCORE FILTER_CONTEXT_MESSAGES FILTER_ALWAYS_INCLUDE
  FILTER_EXCLUDE FILTER_MAX_CONTEXT_TOKENS FILTER_INCLUDE_SERVER_DESCRIPTION FILTER_DEBUG
)

BUILD_ARGS=""
for VAR in "${VARS_TO_PROPAGATE[@]}"; do
  if [ -n "${!VAR:-}" ]; then
    BUILD_ARGS+=" --build-arg ${VAR}=${!VAR}"
    echo "→ Propagating ${VAR}"
  fi
done

# 3. Execute Build
docker build ${BUILD_ARGS} -t "${IMAGE_NAME}:${IMAGE_TAG}" -t "${IMAGE_NAME}:latest" .
