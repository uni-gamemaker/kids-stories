import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { timingSafeEqual } from "node:crypto";
import { createMcpServer } from "./server";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type McpAuthMode = "secret-url" | "bearer" | "open";
export function mcpAuthMode(): McpAuthMode {
  return process.env.MCP_URL_SECRET ? "secret-url" : process.env.MCP_ACCESS_TOKEN ? "bearer" : "open";
}

// Stateless Streamable HTTP: a fresh server + transport per request (fits serverless).
export async function serveMcp(req: Request, urlSecret?: string): Promise<Response> {
  const unauthorized = () => Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }, { status: 401 });
  const secret = process.env.MCP_URL_SECRET;
  const token = process.env.MCP_ACCESS_TOKEN;
  if (urlSecret !== undefined) {
    // /mcp/<secret>: for AI apps whose connector dialog cannot send custom headers (ChatGPT, Claude "authless").
    if (!secret || !same(urlSecret, secret)) return Response.json({ error: "Not found" }, { status: 404 });
  } else if (secret && !token) {
    return Response.json({ error: "Not found" }, { status: 404 }); // secret-URL mode: plain /mcp is closed
  } else if (token && !same(req.headers.get("authorization") ?? "", `Bearer ${token}`)) {
    return unauthorized();
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}
