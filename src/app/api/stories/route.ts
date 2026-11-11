import { createStory, advanceStory } from "@/lib/story/engine";
import { TEMPLATES } from "@/lib/story/templates";
import { db, ensureSchema } from "@/lib/turso";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const d = requireAdmin(req); if (d) return d;
  await ensureSchema();
  const r = await db().execute("SELECT id, series_no, title, status, hero_name, pdf_url, created_at FROM stories ORDER BY created_at DESC, rowid DESC LIMIT 20");
  return Response.json({ templates: TEMPLATES.map((t) => ({ series_no: t.series_no, slug: t.slug })), stories: r.rows });
}
export async function POST(req: Request) {
  const d = requireAdmin(req); if (d) return d;
  const b = (await req.json().catch(() => ({}))) ?? {};
  const { story = "first-dentist-visit", ...order } = b;
  const r = await createStory(story, order);
  if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
  return Response.json(await advanceStory(r.id), { status: 201 });
}
