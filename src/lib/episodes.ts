// Episode memory/queue. Scheduled AI runs have no chat memory, so the database is the memory:
// it holds the author's queued stories and everything already made (to avoid repeats).
import { randomUUID } from "node:crypto";
import { db, ensureSchema } from "./turso";

export const EPISODE_STATUSES = ["planned", "generating", "merged", "scheduled", "published", "failed"] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export interface Episode {
  id: string; title: string; summary: string; story_text: string; scenes: unknown[]; caption: string;
  status: EpisodeStatus; merge_task_id: string | null; video_url: string | null; notes: string; created_at: string; updated_at: string;
}
const row = (r: any): Episode => ({
  id: r.id, title: r.title, summary: r.summary ?? "", story_text: r.story_text ?? "",
  scenes: (() => { try { return JSON.parse(r.scenes_json || "[]"); } catch { return []; } })(),
  caption: r.caption ?? "", status: r.status, merge_task_id: r.merge_task_id ?? null, video_url: r.video_url ?? null,
  notes: r.notes ?? "", created_at: r.created_at, updated_at: r.updated_at,
});

export interface EpisodeInput {
  episode_id?: string; title?: string; summary?: string; story_text?: string; scenes?: unknown[];
  caption?: string; status?: EpisodeStatus; merge_task_id?: string; video_url?: string; notes?: string;
}

export async function saveEpisode(i: EpisodeInput): Promise<{ ok: true; episode: Episode } | { ok: false; error: string }> {
  await ensureSchema();
  const now = new Date().toISOString();
  if (!i.episode_id) {
    if (!i.title?.trim()) return { ok: false, error: "A new episode needs a title." };
    const id = randomUUID();
    await db().execute({
      sql: `INSERT INTO episodes (id, title, summary, story_text, scenes_json, caption, status, merge_task_id, video_url, notes, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [id, i.title.trim(), i.summary ?? "", i.story_text ?? "", JSON.stringify(i.scenes ?? []), i.caption ?? "", i.status ?? "planned", i.merge_task_id ?? null, i.video_url ?? null, i.notes ?? "", now, now],
    });
    return { ok: true, episode: (await getEpisode(id))! };
  }
  const cur = await getEpisode(i.episode_id);
  if (!cur) return { ok: false, error: `Episode not found: ${i.episode_id}` };
  const m = { ...cur, ...Object.fromEntries(Object.entries(i).filter(([k, v]) => k !== "episode_id" && v !== undefined)) } as Episode;
  await db().execute({
    sql: `UPDATE episodes SET title=?, summary=?, story_text=?, scenes_json=?, caption=?, status=?, merge_task_id=?, video_url=?, notes=?, updated_at=? WHERE id=?`,
    args: [m.title, m.summary, m.story_text, JSON.stringify(m.scenes), m.caption, m.status, m.merge_task_id, m.video_url, m.notes, now, cur.id],
  });
  return { ok: true, episode: (await getEpisode(cur.id))! };
}

export async function getEpisode(id: string): Promise<Episode | null> {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT * FROM episodes WHERE id=?", args: [id] });
  return r.rows[0] ? row(r.rows[0]) : null;
}

// Queue order: planned episodes oldest-first (the author's order); everything else newest-first.
export async function listEpisodes(opts: { status?: EpisodeStatus; limit?: number } = {}): Promise<Episode[]> {
  await ensureSchema();
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20));
  const order = opts.status === "planned" ? "created_at ASC, rowid ASC" : "created_at DESC, rowid DESC";
  const r = await db().execute({ sql: `SELECT * FROM episodes ${opts.status ? "WHERE status=?" : ""} ORDER BY ${order} LIMIT ?`, args: opts.status ? [opts.status, limit] : [limit] });
  return r.rows.map(row);
}
