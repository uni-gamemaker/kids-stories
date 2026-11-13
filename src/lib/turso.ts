// Turso (libSQL over HTTP) data layer. No local files: works on Vercel serverless.
import { createClient, type Client, type InValue } from "@libsql/client";

let _client: Client | null = null;
let _schemaReady: Promise<void> | null = null;

export function db(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL is not set");
    _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return _client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    provider TEXT,
    provider_task_id TEXT,
    key_id TEXT,
    model TEXT NOT NULL,
    type TEXT NOT NULL,
    prompt TEXT DEFAULT '',
    params_json TEXT DEFAULT '{}',
    status TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    result_urls_json TEXT,
    error_message TEXT,
    attempts_json TEXT DEFAULT '[]',
    story_id TEXT,
    page_no INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    label TEXT DEFAULT '',
    api_key TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_used_at TEXT,
    last_checked_at TEXT,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  // Story product: one row per ordered/generated story.
  `CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    series_no INTEGER NOT NULL,           -- position in the sequence (1 = first dentist visit)
    slug TEXT NOT NULL,                   -- e.g. first-dentist-visit
    title TEXT NOT NULL,
    hero_name TEXT NOT NULL DEFAULT 'Adam',
    order_json TEXT DEFAULT '{}',         -- order-form fields (child name, place, toy, worry...)
    status TEXT NOT NULL DEFAULT 'draft', -- draft | generating | ready | failed
    pdf_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,
  // One row per page: text + illustration prompt + resulting image URL.
  `CREATE TABLE IF NOT EXISTS story_pages (
    story_id TEXT NOT NULL,
    page_no INTEGER NOT NULL,
    text TEXT NOT NULL,
    image_prompt TEXT NOT NULL,
    image_task_id TEXT,
    image_url TEXT,
    PRIMARY KEY (story_id, page_no)
  )`,
  // Episodes: the memory + queue for the "one short story video a day" pipeline.
  `CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    story_text TEXT DEFAULT '',          -- the author's own story / script
    scenes_json TEXT DEFAULT '[]',       -- [{prompt, dialogue?, image_task_id?, video_task_id?}]
    caption TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planned', -- planned | generating | merged | scheduled | published | failed
    merge_task_id TEXT,
    video_url TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_keys_order ON api_keys(provider, created_at, id)`,
];

export function ensureSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      for (const stmt of SCHEMA) await db().execute(stmt);
    })().catch((e) => {
      _schemaReady = null; // allow retry on next call
      throw e;
    });
  }
  return _schemaReady;
}

export async function dbHealthy(): Promise<boolean> {
  try {
    await db().execute("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// ---------- Tasks ----------
export type TaskStatus = "pending" | "processing" | "completed" | "failed";
export type TaskType = "image" | "video" | "merge";

export interface Attempt {
  provider: string;
  keyId: string;
  keyLabel: string;
  ok: boolean;
  errorClass?: string;
  error?: string;
  at: string;
}

export interface TaskRow {
  id: string;
  provider: string | null;
  provider_task_id: string | null;
  key_id: string | null;
  model: string;
  type: TaskType;
  prompt: string;
  params: Record<string, unknown>;
  status: TaskStatus;
  progress: number;
  result_urls: string[];
  error_message: string | null;
  attempts: Attempt[];
  story_id: string | null;
  page_no: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function parseJson<T>(s: unknown, fallback: T): T {
  try {
    return typeof s === "string" && s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function rowToTask(r: Record<string, unknown>): TaskRow {
  return {
    id: String(r.id),
    provider: (r.provider as string) ?? null,
    provider_task_id: (r.provider_task_id as string) ?? null,
    key_id: (r.key_id as string) ?? null,
    model: String(r.model),
    type: r.type as TaskType,
    prompt: String(r.prompt ?? ""),
    params: parseJson(r.params_json, {}),
    status: r.status as TaskStatus,
    progress: Number(r.progress ?? 0),
    result_urls: parseJson(r.result_urls_json, [] as string[]),
    error_message: (r.error_message as string) ?? null,
    attempts: parseJson(r.attempts_json, [] as Attempt[]),
    story_id: (r.story_id as string) ?? null,
    page_no: r.page_no == null ? null : Number(r.page_no),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    completed_at: (r.completed_at as string) ?? null,
  };
}

export interface NewTask {
  id: string;
  provider?: string | null;
  model: string;
  type: TaskType;
  prompt?: string;
  params?: Record<string, unknown>;
  status?: TaskStatus;
  story_id?: string | null;
  page_no?: number | null;
}

export async function insertTask(t: NewTask): Promise<void> {
  await ensureSchema();
  await db().execute({
    sql: `INSERT INTO tasks (id, provider, model, type, prompt, params_json, status, story_id, page_no)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [
      t.id,
      t.provider ?? null,
      t.model,
      t.type,
      t.prompt ?? "",
      JSON.stringify(t.params ?? {}),
      t.status ?? "pending",
      t.story_id ?? null,
      t.page_no ?? null,
    ],
  });
}

export async function getTask(id: string): Promise<TaskRow | null> {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT * FROM tasks WHERE id = ?", args: [id] });
  return r.rows[0] ? rowToTask(r.rows[0] as unknown as Record<string, unknown>) : null;
}

export interface TaskPatch {
  provider?: string | null;
  provider_task_id?: string | null;
  key_id?: string | null;
  status?: TaskStatus;
  progress?: number;
  result_urls?: string[];
  error_message?: string | null;
  appendAttempt?: Attempt;
}

// Partial update. Appends attempts and sets completed_at automatically.
export async function updateTask(id: string, p: TaskPatch): Promise<void> {
  await ensureSchema();
  const sets: string[] = ["updated_at = datetime('now')"];
  const args: InValue[] = [];
  const add = (col: string, v: InValue) => {
    sets.push(`${col} = ?`);
    args.push(v);
  };
  if (p.provider !== undefined) add("provider", p.provider);
  if (p.provider_task_id !== undefined) add("provider_task_id", p.provider_task_id);
  if (p.key_id !== undefined) add("key_id", p.key_id);
  if (p.status !== undefined) {
    add("status", p.status);
    if (p.status === "completed" || p.status === "failed") sets.push("completed_at = datetime('now')");
  }
  if (p.progress !== undefined) add("progress", Math.max(0, Math.min(100, Math.round(p.progress))));
  if (p.result_urls !== undefined) add("result_urls_json", JSON.stringify(p.result_urls));
  if (p.error_message !== undefined) add("error_message", p.error_message);
  if (p.appendAttempt) {
    const cur = await getTask(id);
    const attempts = [...(cur?.attempts ?? []), p.appendAttempt];
    add("attempts_json", JSON.stringify(attempts));
  }
  args.push(id);
  await db().execute({ sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, args });
}

export async function listRecentTasks(
  limit = 10,
  f: { type?: TaskType; status?: TaskStatus | "processing" } = {},
): Promise<TaskRow[]> {
  await ensureSchema();
  const where: string[] = [];
  const args: InValue[] = [];
  if (f.type) {
    where.push("type = ?");
    args.push(f.type);
  }
  if (f.status) {
    if (f.status === "processing") where.push("status IN ('pending','processing')");
    else {
      where.push("status = ?");
      args.push(f.status);
    }
  }
  args.push(Math.max(1, Math.min(200, limit)));
  const r = await db().execute({
    sql: `SELECT * FROM tasks ${where.length ? "WHERE " + where.join(" AND ") : ""}
          ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    args,
  });
  return r.rows.map((x) => rowToTask(x as unknown as Record<string, unknown>));
}

export async function taskStats() {
  await ensureSchema();
  const r = await db().execute(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN status IN ('pending','processing') THEN 1 ELSE 0 END) AS running
    FROM tasks`);
  const x = r.rows[0] as unknown as Record<string, unknown>;
  return {
    total: Number(x.total ?? 0),
    completed: Number(x.completed ?? 0),
    failed: Number(x.failed ?? 0),
    running: Number(x.running ?? 0),
  };
}
