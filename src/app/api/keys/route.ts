import { listKeys, addKey, publicKey } from "@/lib/keys";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const d = requireAdmin(req); if (d) return d;
  return Response.json({ keys: (await listKeys()).map(publicKey) });
}
export async function POST(req: Request) {
  const d = requireAdmin(req); if (d) return d;
  const b = await req.json().catch(() => null);
  if (!b || !["kie", "cometapi"].includes(b.provider) || typeof b.api_key !== "string") return Response.json({ error: "Expected {provider: 'kie'|'cometapi', api_key, label?}" }, { status: 400 });
  const r = await addKey(b.provider, b.api_key, typeof b.label === "string" ? b.label.slice(0, 60) : "");
  return r.ok ? Response.json({ id: r.id }, { status: 201 }) : Response.json({ error: r.error }, { status: 409 });
}
