import { MCPToolFilter } from "@portkey-ai/mcp-tool-filter";
import type {
  MCPServer,
  MCPTool,
  MCPToolFilterConfig,
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
import { Logger } from "pino";
import * as packageJson from "../package.json" with { type: "json" };
import { getConfig } from "./config.js";
import { getLogger } from "./logger.js";
import { resolveInstructions } from "./resolveInstructions.js";

/**
 * Clients that cooperate with the filter can pass a plain-text context hint
 * in `params._meta.filterContext`. When absent, all tools are returned.
 */
const FILTER_CONTEXT_KEY = "filterContext";

export class FilterProxy {
  private upstreamClient: Client;
  private filter: MCPToolFilter;
  private initialized = false;
  private upstreamInstructions: string | undefined;

  private constructor(private readonly logger: Logger) {
    const config = getConfig();
    this.upstreamClient = new Client(
      {
        name: `${packageJson.default.name}-upstream-client`,
        version: packageJson.default.version,
      },
      { capabilities: {} },
    );

    const toolFilterConfig: MCPToolFilterConfig = {
      embedding: config.embedding,
      defaultOptions: config.filter,
      includeServerDescription: config.filter.includeServerDescription,
      debug: config.filter.debug,
    };
    this.logger.info({ config: toolFilterConfig }, "MCPToolFilter config");
    this.filter = new MCPToolFilter(toolFilterConfig);
  }

  static async create(): Promise<FilterProxy> {
    const proxyLogger = getLogger().child({
      component: "proxy",
    });
    const proxy = new FilterProxy(proxyLogger);
    await proxy.connectUpstream();
    await proxy.initFilter();
    return proxy;
  }

  private createUpstreamTransport() {
    const { upstream } = getConfig();
    this.logger.debug({ upstream }, "Initializing upstream transport...");
    switch (upstream?.transport) {
      case "http":
        return new StreamableHTTPClientTransport(new URL(upstream.url));
      case "stdio":
        return new StdioClientTransport({
          ...upstream,
          stderr: "inherit",
        });
      default:
        throw new Error(`Invalid upstream config: ${JSON.stringify(upstream)}`);
    }
  }

  private async connectUpstream(): Promise<void> {
    await this.upstreamClient.connect(this.createUpstreamTransport());
    const upstreamInstructions = this.upstreamClient.getInstructions();
    this.upstreamInstructions = await resolveInstructions(
      getConfig().instructions,
      upstreamInstructions,
    );
    this.logger.debug(
      { instructions: this.upstreamInstructions },
      "Upstream connected",
    );
  }

  private async initFilter(): Promise<void> {
    const { tools: upstreamTools } = await this.upstreamClient.listTools();
    const toolsToFilter = upstreamTools.map(
      (t): MCPTool => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema as Record<string, unknown>,
      }),
    );
    const mcpServer: MCPServer = {
      id: "upstream",
      name: "upstream",
      tools: toolsToFilter,
    };
    if (this.logger.isLevelEnabled("debug")) {
      this.logger.debug(
        { tools: toolsToFilter.map(({ name }) => name) },
        "Initializing filter",
      );
    }
    await this.filter.initialize([mcpServer]);
    this.initialized = true;
  }

  /**
   * Extracts a plain-string filter context from `params._meta.filterContext`.
   * Returns undefined when absent or when _meta carries only protocol fields
   * (e.g. `{ progressToken: N }`).
   */
  private extractFilterContext(
    params: Record<string, unknown> | undefined,
  ): string | undefined {
    return (params?._meta as Record<string, string>)?.[FILTER_CONTEXT_KEY];
  }

  createProxyMCPServer(): Server {
    const server = new Server(
      { name: packageJson.default.name, version: packageJson.default.version },
      { capabilities: { tools: {} }, instructions: this.upstreamInstructions },
    );

    server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      if (!this.initialized) {
        throw new Error("Filter not initialized");
      }

      const { params } = request;
      const filterContext = this.extractFilterContext(params);

      if (!filterContext) {
        // No context hint — return all tools unfiltered.
        // Covers: MCP Inspector, first turn, any non-cooperating client.
        const { tools }: { tools: Tool[] } =
          await this.upstreamClient.listTools();
        this.logger.debug({ tools }, "tools/list: no context hint");
        return { tools };
      }

      const { tools: scored, metrics } =
        await this.filter.filter(filterContext);

      const tools = scored.map(
        (s): Tool => ({
          name: s.toolName,
          description: s.tool.description,
          inputSchema: (s.tool.inputSchema ?? {
            type: "object",
            properties: {},
          }) as Tool["inputSchema"],
        }),
      );

      this.logger.debug(
        { tools, filter: filterContext, metrics },
        "tools/list: filtered by context",
      );
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args, task, _meta } = request.params;
      const params = { name, arguments: args, task, _meta };
      this.logger.debug({ params }, `tools/call: ${name}`);
      return this.upstreamClient.callTool(params);
    });

    return server;
  }
}
