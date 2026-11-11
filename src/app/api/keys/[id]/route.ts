import { setKeyStatus, deleteKey } from "@/lib/keys";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const d = requireAdmin(req); if (d) return d;
  const b = await req.json().catch(() => null);
  if (!b || !["active", "disabled"].includes(b.status)) return Response.json({ error: "Expected {status: 'active'|'disabled'}" }, { status: 400 });
  await setKeyStatus(params.id, b.status);
  return Response.json({ ok: true });
}
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const d = requireAdmin(req); if (d) return d;
  await deleteKey(params.id);
  return Response.json({ ok: true });
}
