// Client for the Video Merger API v2 (the merger/ project in this repo).
import { randomUUID } from "node:crypto";
import { insertTask, getTask, updateTask, type TaskRow } from "./turso";
import type { Progress } from "./generation";

export const MAX_CLIPS = 10;
const base = () => (process.env.MERGER_API_BASE || "").replace(/\/$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Guards against running /process twice concurrently (runMerge vs get_task).
const processInFlight = new Set<string>();

export async function mergerStatus(): Promise<{ healthy: boolean; detail: string }> {
  if (!base()) return { healthy: false, detail: "MERGER_API_BASE is not set." };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`${base()}/api/config`, { signal: ctl.signal, redirect: "manual" });
    const text = await r.text();
    clearTimeout(t);
    let cfg: any = null;
    try { cfg = JSON.parse(text); } catch { /* not JSON */ }
    if (r.ok && cfg && typeof cfg.maxSources === "number") return { healthy: true, detail: "ok" };
    if (r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400) || /authentication required|vercel\.com\/sso|log in to vercel/i.test(text))
      return { healthy: false, detail: `HTTP ${r.status}: Vercel Deployment Protection is blocking the merger. Disable it for the merger project (Settings → Deployment Protection).` };
    if (r.status === 404) return { healthy: false, detail: "HTTP 404: /api/config not found. Is the merger project's Root Directory set to 'merger', and is its latest deployment Ready?" };
    if (r.ok) return { healthy: false, detail: "The address answers but is not the merger (wrong project or Root Directory?)." };
    return { healthy: false, detail: `HTTP ${r.status}: ${text.replace(/\s+/g, " ").slice(0, 120)}` };
  } catch (e) {
    return { healthy: false, detail: `Could not connect: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
export async function mergerHealthy(): Promise<boolean> { return (await mergerStatus()).healthy; }

async function mfetch(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<{ status: number; body: any }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base()}${path}`, { ...init, signal: ctl.signal });
    const text = await res.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text.slice(0, 200) }; }
    return { status: res.status, body };
  } finally { clearTimeout(t); }
}

const DONE = /^(done|completed|complete|success|succeeded|finished)$/;
const FAIL = /^(error|failed|failure|cancelled)$/;

export function parseJob(body: any, id: string): { state: "processing" | "done" | "failed"; progress: number; url?: string; error?: string } {
  const s = String(body?.status ?? "").toLowerCase();
  let progress = Number(body?.progress ?? 0);
  if (progress > 0 && progress <= 1) progress *= 100;
  if (!s && body?.error) return { state: "failed", progress: 0, error: String(body.error) };
  if (FAIL.test(s)) return { state: "failed", progress, error: String(body?.error ?? "Merge failed.") };
  if (DONE.test(s)) {
    const url = body?.videoUrl || body?.downloadUrl || `${base()}/api/jobs/${id}/video`;
    return { state: "done", progress: 100, url };
  }
  return { state: "processing", progress };
}

export function validateUrls(urls: string[]): string | null {
  if (urls.length < 2) return "❌ Merging needs at least two clips. Pass urls (direct links) or task_ids of completed tasks.";
  if (urls.length > MAX_CLIPS) return "❌ The maximum number of clips for merging is 10 (the merging service accepts a maximum of 10 clips).";
  for (const u of urls) {
    try { const p = new URL(u); if (p.protocol !== "http:" && p.protocol !== "https:") throw 0; }
    catch { return `❌ Not a direct public http/https link: ${u.slice(0, 80)}`; }
  }
  return null;
}

// Resolve completed video tasks to their URLs, keeping the given order.
export async function resolveTaskUrls(ids: string[]): Promise<{ urls: string[]; problems: string[] }> {
  const urls: string[] = [];
  const problems: string[] = [];
  for (const id of ids) {
    const t = await getTask(id);
    if (!t) problems.push(`${id}: task not found`);
    else if (t.status !== "completed" || !t.result_urls[0]) problems.push(`${id}: not completed yet (status: ${t.status})`);
    else urls.push(t.result_urls[0]);
  }
  return { urls, problems };
}

async function applyProcessResult(taskId: string, jobId: string, status: number, body: any) {
  if (status === 202 || status === 409) return; // already processing / already finished: the next poll resolves it
  if (status >= 400 || body?.error) {
    // Declared service errors are deterministic: final failure, no retry.
    await updateTask(taskId, { status: "failed", error_message: String(body?.error ?? `Merger HTTP ${status}`) });
    return;
  }
  const p = parseJob(body, jobId);
  if (p.state === "done") await updateTask(taskId, { status: "completed", progress: 100, result_urls: [p.url!], error_message: null });
  else if (p.state === "failed") await updateTask(taskId, { status: "failed", error_message: p.error ?? "Merge failed." });
}

function startProcess(taskId: string, jobId: string): Promise<void> {
  if (processInFlight.has(jobId)) return Promise.resolve();
  processInFlight.add(jobId);
  return mfetch(`/api/jobs/${jobId}/process`, { method: "POST" }, 280_000)
    .then(({ status, body }) => applyProcessResult(taskId, jobId, status, body))
    .catch(() => { /* our own network error: temporary, polling continues */ })
    .finally(() => { processInFlight.delete(jobId); });
}

export async function runMerge(a: { urls: string[]; waitSeconds: number; onProgress?: Progress }): Promise<{ kind: "error"; message: string } | { kind: "task"; task: TaskRow }> {
  const bad = validateUrls(a.urls);
  if (bad) return { kind: "error", message: bad };
  if (!base()) return { kind: "error", message: "❌ The merging service is not configured (MERGER_API_BASE)." };
  const id = randomUUID();
  await insertTask({ id, provider: "merger", model: "video-merger", type: "merge", prompt: `Merge ${a.urls.length} clips`, params: { urls: a.urls }, status: "processing" });
  try {
    const { status, body } = await mfetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videos: a.urls }) });
    if (status >= 400 || !body?.jobId) {
      await updateTask(id, { status: "failed", error_message: String(body?.error ?? `Merger HTTP ${status}`) });
      return { kind: "task", task: (await getTask(id))! };
    }
    await updateTask(id, { provider_task_id: String(body.jobId), progress: 5 });
  } catch (e) {
    await updateTask(id, { status: "failed", error_message: "Could not reach the merging service." });
    return { kind: "task", task: (await getTask(id))! };
  }
  const t0 = (await getTask(id))!;
  const proc = startProcess(id, t0.provider_task_id!);
  const deadline = Date.now() + a.waitSeconds * 1000;
  let cur = t0;
  while (cur.status === "processing" && Date.now() < deadline) {
    await Promise.race([proc, sleep(3000)]);
    cur = (await pollMerge(cur)) ?? cur;
    await a.onProgress?.(cur.progress, `Merging… ${cur.progress}%`);
  }
  return { kind: "task", task: cur };
}

async function pollMerge(t: TaskRow): Promise<TaskRow | null> {
  const jobId = t.provider_task_id;
  if (!jobId) return t;
  try {
    const { status, body } = await mfetch(`/api/jobs/${jobId}`);
    if (status === 404) {
      await updateTask(t.id, { status: "failed", error_message: "The merge task does not exist on the service (it was deleted or it expired after 24 hours)." });
    } else if (status >= 400) {
      await updateTask(t.id, { status: "failed", error_message: String(body?.error ?? `Merger HTTP ${status}`) });
    } else {
      const p = parseJob(body, jobId);
      if (p.state === "done") await updateTask(t.id, { status: "completed", progress: 100, result_urls: [p.url!], error_message: null });
      else if (p.state === "failed") await updateTask(t.id, { status: "failed", error_message: p.error ?? "Merge failed." });
      else await updateTask(t.id, { progress: Math.max(t.progress, p.progress) });
    }
  } catch { /* temporary network error: keep polling */ }
  return getTask(t.id);
}

export async function refreshMergeTask(t: TaskRow): Promise<TaskRow | null> {
  const cur = await pollMerge(t);
  if (cur && cur.status === "processing" && cur.provider_task_id && !processInFlight.has(cur.provider_task_id)) {
    void startProcess(cur.id, cur.provider_task_id); // run the process step now if it has not run
  }
  return cur;
}
