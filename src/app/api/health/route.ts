import { dbHealthy } from "@/lib/turso";
import { mergerStatus } from "@/lib/merger";
import { getModels } from "@/lib/models";
import { mcpAuthMode } from "@/lib/mcp/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [dbOk, merger] = await Promise.all([dbHealthy(), mergerStatus()]);
  return Response.json({
    ok: dbOk,
    database: dbOk ? "turso-connected" : "turso-unreachable",
    mcpEndpoint: "/mcp",
    models: getModels().map((m) => ({ canonical: m.canonical, type: m.type, providers: m.providers })),
    merger: { base: process.env.MERGER_API_BASE || null, healthy: merger.healthy, detail: merger.detail },
    mcpAuth: mcpAuthMode(), // "secret-url" | "bearer" | "open"
    authRequired: mcpAuthMode() !== "open",
  });
}
