import { advanceStory } from "@/lib/story/engine";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const d = requireAdmin(req); if (d) return d;
  const s = await advanceStory(params.id);
  return s ? Response.json(s) : Response.json({ error: "Story not found." }, { status: 404 });
}
