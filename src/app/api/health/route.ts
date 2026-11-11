import { dbHealthy } from "@/lib/turso";
import { mergerHealthy } from "@/lib/merger";
import { getModels } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [dbOk, mergerOk] = await Promise.all([dbHealthy(), mergerHealthy()]);
  return Response.json({
    ok: dbOk,
    database: dbOk ? "turso-connected" : "turso-unreachable",
    mcpEndpoint: "/mcp",
    models: getModels().map((m) => ({ canonical: m.canonical, type: m.type, providers: m.providers })),
    merger: { base: process.env.MERGER_API_BASE || null, healthy: mergerOk },
    authRequired: !!process.env.MCP_ACCESS_TOKEN,
  });
}
