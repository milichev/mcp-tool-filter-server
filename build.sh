#!/usr/bin/env bash
# build.sh — build the mcp-tool-filter-server Docker image
# Usage:
#   ./build.sh [TAG]
# Example:
#   ./build.sh 1.0.0
#   ./build.sh          # defaults to "latest"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANYTYPE_MCP_DIR="${ANYTYPE_MCP_DIR:-${SCRIPT_DIR}/../anytype-mcp}"
UPSTREAM_DIR="${SCRIPT_DIR}/upstream"
IMAGE_NAME="${IMAGE_NAME:-mcp-tool-filter-server}"
TAG="${1:-latest}"

echo "▶ Resolving anytype-mcp cli.mjs from: ${ANYTYPE_MCP_DIR}"

# ── Locate cli.mjs ───────────────────────────────────────────────────────────
CLI_SRC="${ANYTYPE_MCP_DIR}/bin/cli.mjs"
if [[ ! -f "${CLI_SRC}" ]]; then
  echo "ERROR: ${CLI_SRC} not found."
  echo "  Either build anytype-mcp first ('npm run build' in ${ANYTYPE_MCP_DIR})"
  echo "  or set ANYTYPE_MCP_DIR to point at the repo root."
  exit 1
fi

# ── Copy upstream bundle into build context ──────────────────────────────────
mkdir -p "${UPSTREAM_DIR}"
cp "${CLI_SRC}" "${UPSTREAM_DIR}/cli.mjs"
echo "✔ Copied cli.mjs → upstream/cli.mjs ($(du -sh "${UPSTREAM_DIR}/cli.mjs" | cut -f1))"

# ── Build image ───────────────────────────────────────────────────────────────
echo "▶ Building Docker image ${IMAGE_NAME}:${TAG}"
docker build \
  --tag "${IMAGE_NAME}:${TAG}" \
  "${SCRIPT_DIR}"

echo "✔ Done: ${IMAGE_NAME}:${TAG}"
