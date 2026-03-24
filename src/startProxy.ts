import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getConfig } from "./config.js";
import { FilterProxy } from "./proxy.js";
import { getLogger } from "./logger.js";

export async function startProxy(): Promise<void> {
  const config = getConfig();
  const logger = getLogger().child({
    component: "proxy-middleware",
  });
  const proxy = await FilterProxy.create();

  async function readBody(
    req: import("node:http").IncomingMessage,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : undefined);
        } catch (err) {
          logger.error({ err }, "error parsing request payload");
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  if (config.proxy.transport === "http") {
    const http = await import("node:http");
    const corsHeaders = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Mcp-Protocol-Version",
      "Access-Control-Max-Age": "86400",
    };
    const httpServer = http.createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      let reqBody: unknown;
      try {
        reqBody = await readBody(req);
      } catch (err) {
        logger.error({ err }, "Error reading proxy request body");
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid request body" }));
        return;
      }
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless
        });
        const mcpServer = proxy.createProxyMCPServer();
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, reqBody);
      } catch (err) {
        logger.error({ err }, "Error processing proxy request");
        res.writeHead(500);
        res.end();
        return;
      }
    });
    const { port } = config.proxy;
    httpServer.listen(port, () => {
      logger.info(`listening on http://0.0.0.0:${port}/mcp`);
    });
  } else {
    await proxy.createProxyMCPServer().connect(new StdioServerTransport());
    logger.info("running on stdio");
  }
}
