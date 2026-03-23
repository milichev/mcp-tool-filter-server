import { MCPToolFilter } from "@portkey-ai/mcp-tool-filter";
import type {
  MCPServer,
  MCPTool,
  ScoredTool,
} from "@portkey-ai/mcp-tool-filter";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as packageJson from "../package.json" with { type: "json" };
import { getConfig } from "./config.js";

const UPSTREAM_SERVER_ID = "upstream";

/**
 * Clients that cooperate with the filter can pass a plain-text context hint
 * in `params._meta.filterContext`. When absent, all tools are returned.
 */
const FILTER_CONTEXT_KEY = "filterContext";

export class FilterProxy {
  private upstreamClient: Client;
  private filter: MCPToolFilter;
  private initialized = false;

  private constructor() {
    const config = getConfig();
    this.upstreamClient = new Client(
      {
        name: "mcp-tool-filter-server-upstream-client",
        version: packageJson.default.version,
      },
      { capabilities: {} },
    );
    this.filter = new MCPToolFilter({
      embedding: config.embedding,
      defaultOptions: {
        topK: config.filter.topK,
        minScore: config.filter.minScore,
        contextMessages: config.filter.contextMessages,
        alwaysInclude: config.filter.alwaysInclude,
        exclude: config.filter.exclude,
        maxContextTokens: config.filter.maxContextTokens,
      },
      includeServerDescription: config.filter.includeServerDescription,
      debug: config.filter.debug,
    });
  }

  static async create(): Promise<FilterProxy> {
    const proxy = new FilterProxy();
    await proxy.connectUpstream();
    await proxy.initFilter();
    return proxy;
  }

  private createUpstreamTransport() {
    const { upstream: upstreamConfig } = getConfig();
    switch (upstreamConfig?.transport) {
      case "http":
        return new StreamableHTTPClientTransport(new URL(upstreamConfig.url));
      case "stdio":
        return new StdioClientTransport(upstreamConfig);
      default:
        throw new Error(
          `Invalid upstream config: ${JSON.stringify(upstreamConfig)}`,
        );
    }
  }

  private async connectUpstream(): Promise<void> {
    await this.upstreamClient.connect(this.createUpstreamTransport());
  }

  private async initFilter(): Promise<void> {
    const { tools: upstreamTools } = await this.upstreamClient.listTools();
    const mcpServer: MCPServer = {
      id: UPSTREAM_SERVER_ID,
      name: "upstream",
      tools: upstreamTools.map(
        (t): MCPTool => ({
          name: t.name,
          description: t.description ?? "",
          inputSchema: t.inputSchema as Record<string, unknown>,
        }),
      ),
    };
    await this.filter.initialize([mcpServer]);
    this.initialized = true;
  }

  /**
   * Extracts a plain-string filter context from `params._meta.filterContext`.
   * Returns undefined when absent or when _meta carries only protocol fields
   * (e.g. `{ progressToken: N }`).
   */
  private extractFilterContext(
    params: Record<string, unknown>,
  ): string | undefined {
    const meta = params._meta;
    if (meta === null || typeof meta !== "object") return undefined;
    const value = (meta as Record<string, unknown>)[FILTER_CONTEXT_KEY];
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  createProxyMCPServer(): Server {
    const server = new Server(
      { name: "mcp-tool-filter-server", version: packageJson.default.version },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      if (!this.initialized) {
        throw new Error("Filter not initialized");
      }

      const filterContext = this.extractFilterContext(
        (request.params ?? {}) as Record<string, unknown>,
      );

      if (!filterContext) {
        // No context hint — return all tools unfiltered.
        // Covers: MCP Inspector, first turn, any non-cooperating client.
        const { tools } = await this.upstreamClient.listTools();
        return { tools };
      }

      const { tools: scored }: { tools: ScoredTool[] } =
        await this.filter.filter(filterContext);

      const tools: Tool[] = scored.map((s) => ({
        name: s.toolName,
        description: s.tool.description,
        inputSchema: (s.tool.inputSchema ?? {
          type: "object",
          properties: {},
        }) as Tool["inputSchema"],
      }));

      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.upstreamClient.callTool({ name, arguments: args });
    });

    return server;
  }
}
