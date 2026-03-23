import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getConfig } from "./config";
import { FilterProxy } from "./proxy";

export async function startProxy(): Promise<void> {
  const config = getConfig();
  const proxy = await FilterProxy.create();

  if (config.proxy.transport === "http") {
    const http = await import("node:http");
    const CORS_HEADERS = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Mcp-Protocol-Version",
      "Access-Control-Max-Age": "86400",
    };
    const httpServer = http.createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
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
        console.error(`Error reading proxy request body`, err);
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
        console.error(`Error processing proxy request`, err);
        res.writeHead(500);
        res.end();
        return;
      }
    });
    const { port } = config.proxy;
    httpServer.listen(port, () => {
      console.error(
        `mcp-tool-filter-server listening on http://0.0.0.0:${port}/mcp`,
      );
    });
  } else {
    await proxy.createProxyMCPServer().connect(new StdioServerTransport());
    console.error("mcp-tool-filter-server running on stdio");
  }
}

async function readBody(
  req: import("node:http").IncomingMessage,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : undefined);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
