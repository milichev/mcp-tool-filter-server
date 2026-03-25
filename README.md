# `mcp-tool-filter-server`

## Overview

MCP proxy server. Filters tools based on request context hints using vector embeddings (local or LLM-based).

Uses [`@portkey-ai/mcp-tool-filter`](https://github.com/Portkey-AI/mcp-tool-filter) as the underlying filtering engine:

> Ultra-fast semantic tool filtering for MCP (Model Context Protocol) servers using embedding similarity. Reduce your tool context from 1000+ tools down to the most relevant 10-20 tools in **under 10ms**.

## Features

- ⚡ **Lightning Fast**: <10ms filtering latency for 1000+ tools with built-in optimizations
- 🚀 **Performance Optimized**: 6-8x faster dot product, smart top-K selection, true LRU cache
- 🎯 **Semantic Understanding**: Uses embeddings for intelligent tool matching
- 📦 **Zero Dependencies on Runtime**: Only requires an embedding provider API
- 🔄 **Flexible Input**: Accepts chat completion messages or raw strings
- 💾 **Smart Caching**: Caches embeddings and context for optimal performance
- 🎛️ **Configurable**: Tune scoring thresholds, top-k, and always-include tools
- 📊 **Performance Metrics**: Built-in timing for optimization

## Usage

### `env` variables

> [!TIP]
>
> Refer to `@portkey-ai/mcp-tool-filter` documentation for the filter and embedding setup and fine-tuning.

Variables with names starting with `EMBEDDING_` and `FILTER_`, are related to 

| Variable                            | Description                                                                                                                                                | Default |
| :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :------ |
| `EMBEDDING_PROVIDER`                | `local`, `openai`, `voyage`, `cohere`                                                                                                                      | `local` |
| `EMBEDDING_MODEL`                   | (Optional)<br>* External: Model name (defaults to provider's recommended model)<br>* Local: HuggingFace model name (defaults to 'Xenova/all-MiniLM-L6-v2') | —       |
| `EMBEDDING_API_KEY`                 | API key for the external providers                                                                                                                         | —       |
| `EMBEDDING_DIMENSIONS`              | Optional: Embedding dimensions (for providers that support it)                                                                                             | —       |
| `EMBEDDING_BASE_URL`                | Optional: Base URL for custom endpoints                                                                                                                    |         |
| `EMBEDDING_QUANTIZED`               | Optional: Quantization level (defaults to true for faster inference)                                                                                       | `false` |
| `FILTER_TOP_K`                      | Number of top tools to return                                                                                                                              | `20`    |
| `FILTER_MIN_SCORE`                  | Minimum similarity score threshold                                                                                                                         | `0.3`   |
| `FILTER_CONTEXT_MESSAGES`           | Number of recent messages to consider for context                                                                                                          | `3`     |
| `FILTER_ALWAYS_INCLUDE`             | Tools to always include regardless of score                                                                                                                | —       |
| `FILTER_EXCLUDE`                    | Tools to exclude from results                                                                                                                              | —       |
| `FILTER_MAX_CONTEXT_TOKENS`         | Maximum tokens for context (default: 500)                                                                                                                  | `500`   |
| `FILTER_INCLUDE_SERVER_DESCRIPTION` | Include server description in tool embeddings for additional context                                                                                       | `false` |
| `FILTER_DEBUG`                      | Enable debug logging                                                                                                                                       | `false` |
| `UPSTREAM_MCP_TRANSPORT`            | `stdio` or `http`                                                                                                                                          | `stdio` |
| `UPSTREAM_MCP_COMMAND`              | Command for stdio (e.g., `node`, `npx`)                                                                                                                    | `npx`   |
| `UPSTREAM_MCP_ARGS`                 | Optional: Comma-separated arguments for stdio upstream server command                                                                                      | —       |
| `UPSTREAM_MCP_ENV`                  | Optional: Comma-separated `KEY:VALUE` for stdio upstream server                                                                                            | —       |
| `UPSTREAM_MCP_CWD`                  | Optional: Working directory for stdio upstream server                                                                                                      | —       |
| `UPSTREAM_MCP_URL`                  | Base URL of the upstream MCP server (HTTP transport)                                                                                                       | —       |
| `PROXY_MCP_TRANSPORT`               | `stdio` or `http`                                                                                                                                          | `stdio` |
| `PROXY_MCP_PORT`                    | Port for HTTP transport                                                                                                                                    | `3000`  |
| `LOG_LEVEL`                         | `trace`, `debug`, `info`, `warn`, `error`, `silent`                                                                                                        | `info`  |

### Docker image

It makes sense to bundle the proxy and upstream MCP servers in a single Docker container.

There is a convenient script for that—`build-image.sh`. Example:

**Build:**

```bash
UPSTREAM_SOURCE=/path/to/upstream-mcp-server.mjs \
  UPSTREAM_MCP_COMMAND=node \
  UPSTREAM_MCP_ARGS="/app/upstream/upstream-mcp-server.mjs" \
  IMAGE_NAME="mcp-tool-filter-server-bundle" \
  IMAGE_TAG="0.1.0" \
  ./build-image.sh
```

**Run (HTTP Proxy):**
In this example, the MCP proxy is 

```bash
docker run -p 3129:3129 --rm \
  --name mcp-bundle \
  --add-host=host.docker.internal:host-gateway \
  --network host \
  -v "/path/to/configs:/app/config" \
  -e 'UPSTREAM_MCP_ENV=KEY:"VAL",FILE_REF:"{file:/app/config/data.json}"' \
  -e 'PROXY_MCP_TRANSPORT=http' \
  mcp-tool-filter-server-bundle:latest			
```

### Integration with ToolHive

For [ToolHive](https://docs.stacklok.com/toolhive/guides-ui/quickstart) integration, configure the proxy as a `stdio` server. Ensure the Docker container or local process has access to the environment variables required for the upstream connection.

## Roadmap

1. Support for multiple upstream MCP servers (aggregation + filtering).
2. JSON-based configuration file support to replace/supplement environment variables.

## Contributing

Submit PRs with descriptive titles. Follow [conventional commits](https://www.conventionalcommits.org/).

## License

MIT