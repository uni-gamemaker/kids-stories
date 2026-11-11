import { loadStory } from "@/lib/story/engine";
import { buildStoryPdf } from "@/lib/story/pdf";
import { db } from "@/lib/turso";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 120;

// Built on demand and streamed to the caller: the PDF itself is never stored.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const d = requireAdmin(req); if (d) return d;
  const s = await loadStory(params.id);
  if (!s) return Response.json({ error: "Story not found." }, { status: 404 });
  if (s.done < s.total) return Response.json({ error: `Illustrations not ready yet (${s.done}/${s.total}).` }, { status: 409 });
  try {
    const bytes = await buildStoryPdf(s);
    await db().execute({ sql: "UPDATE stories SET status='ready', pdf_url=?, updated_at=datetime('now') WHERE id=?", args: [`/api/stories/${s.id}/pdf`, s.id] });
    const name = s.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "story";
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "PDF build failed." }, { status: 500 });
  }
}
