import { listRecentTasks, taskStats } from "@/lib/turso";
import { refreshTask } from "@/lib/generation";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const d = requireAdmin(req); if (d) return d;
  // Nudge a few running tasks forward so the board advances even without an MCP client polling.
  const running = await listRecentTasks(12, { status: "processing" });
  await Promise.all(running.map((t) => refreshTask(t.id).catch(() => null)));
  const [stats, tasks] = await Promise.all([taskStats(), listRecentTasks(20)]);
  return Response.json({
    stats,
    tasks: tasks.map((t) => ({ id: t.id, type: t.type, status: t.status, progress: t.progress, model: t.model, prompt: t.prompt.slice(0, 120), urls: t.result_urls, error: t.status === "failed" ? t.error_message : null, note: t.status === "processing" ? t.error_message : null, provider_task_id: t.provider_task_id, attempts: t.attempts.length, created_at: t.created_at })),
  });
}
