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
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import * as packageJson from "../package.json";
import { getConfig } from "./config.js";

const UPSTREAM_SERVER_ID = "upstream";

export class FilterProxy {
  // private server: Server;
  private upstreamClient: Client;
  private filter: MCPToolFilter;
  private initialized = false;

  private constructor() {
    const config = getConfig();
    this.upstreamClient = new Client(
      {
        name: "mcp-tool-filter-server-upstream-client",
        version: packageJson.version,
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

  /**
   * Connects to the upstream MCP server, loads all tools into the filter,
   * then registers handlers on the downstream Server.
   */
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
    const transport = this.createUpstreamTransport();
    await this.upstreamClient.connect(transport);
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

  createProxyMCPServer(): Server {
    const server = new Server(
      { name: "mcp-tool-filter-server", version: packageJson.version },
      { capabilities: { tools: {} } },
    );

    // tools/list — filter based on the last user message passed as `_context` meta,
    // falling back to listing all tools when no context is available.
    server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      if (!this.initialized) {
        throw new Error("Filter not initialized");
      }

      // MCP spec allows arbitrary meta; Claude sends recent messages via _meta.context
      const context: string | undefined = (
        request.params as Record<string, unknown>
      )?._meta as string | undefined;

      let scored: ScoredTool[];
      if (context) {
        const result = await this.filter.filter(context);
        scored = result.tools;
      } else {
        // No context: return all tools unfiltered so the client can populate its first turn
        const { tools } = await this.upstreamClient.listTools();
        return { tools };
      }

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

    // tools/call — pass through to upstream unchanged
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await this.upstreamClient.callTool({
        name,
        arguments: args,
      });
      return result;
    });

    return server;
  }
}
