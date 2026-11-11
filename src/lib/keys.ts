// API key layer: strict sequential ordering, error classification, masking.
import { randomUUID } from "node:crypto";
import { db, ensureSchema } from "./turso";
import type { ProviderId } from "./models";

export type KeyStatus = "active" | "exhausted" | "disabled";

export interface ApiKeyRow {
  id: string;
  provider: ProviderId;
  label: string;
  api_key: string;
  status: KeyStatus;
  usage_count: number;
  success_count: number;
  fail_count: number;
  last_used_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
}

// Any provider failure is thrown as ProviderError so it can be classified.
export class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export type ErrorClass = "disabled" | "exhausted" | "provider" | "params" | "temporary";

// Order matters: balance problems are checked BEFORE the generic 400 rule,
// because some providers report an exhausted balance with HTTP 400.
export function classifyProviderError(status: number, message: string): ErrorClass {
  const m = (message || "").toLowerCase();
  if (status === 401 || status === 403 || /invalid api key|unauthorized|forbidden|authentication/.test(m)) return "disabled";
  if (status === 402 || /insufficient|quota|balance|credit|out of credits|exhausted|充值/.test(m)) return "exhausted";
  if ([400, 404, 422].includes(status) && /model not found|unsupported model/.test(m)) return "provider";
  if (status === 400 || status === 422) return "params";
  return "temporary"; // 429, 5xx, network, timeout, abort
}

export function classifyError(e: unknown): { cls: ErrorClass; status: number; message: string } {
  if (e instanceof ProviderError) return { cls: classifyProviderError(e.status, e.message), status: e.status, message: e.message };
  const message = e instanceof Error ? e.message : String(e);
  return { cls: "temporary", status: 0, message };
}

// Mid-task failure messages that indicate a key/balance problem (trigger silent failover).
export const KEY_FAILURE_PATTERN = /insufficient|balance|credit|quota|402|401|unauthorized/i;

export function maskKey(k: string): string {
  if (k.length <= 11) return k.slice(0, 3) + "••••";
  return k.slice(0, 7) + "••••••••" + k.slice(-4);
}

// Strict insertion order: first key added is tried first. NOT round-robin.
export async function getKeyPool(providers: ProviderId[]): Promise<ApiKeyRow[]> {
  await ensureSchema();
  if (!providers.length) return [];
  const ph = providers.map(() => "?").join(",");
  const r = await db().execute({
    sql: `SELECT * FROM api_keys WHERE status != 'disabled' AND provider IN (${ph})
          ORDER BY created_at ASC, rowid ASC`, // rowid = true insertion order (id alone is random)
    args: providers,
  });
  return r.rows.map((x) => x as unknown as ApiKeyRow);
}

export async function listKeys(): Promise<ApiKeyRow[]> {
  await ensureSchema();
  const r = await db().execute("SELECT * FROM api_keys ORDER BY created_at ASC, rowid ASC");
  return r.rows.map((x) => x as unknown as ApiKeyRow);
}

export function publicKey(k: ApiKeyRow) {
  const { api_key, ...rest } = k;
  return { ...rest, api_key_masked: maskKey(api_key) };
}

export async function addKey(provider: ProviderId, apiKey: string, label = ""): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await ensureSchema();
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "API key is empty." };
  const dup = await db().execute({ sql: "SELECT id FROM api_keys WHERE provider = ? AND api_key = ?", args: [provider, key] });
  if (dup.rows.length) return { ok: false, error: "This key is already added for this provider." };
  const id = randomUUID();
  // Millisecond-precision created_at so insertion order is preserved within one second.
  await db().execute({
    sql: "INSERT INTO api_keys (id, provider, label, api_key, created_at) VALUES (?,?,?,?,?)",
    args: [id, provider, label, key, new Date().toISOString()],
  });
  return { ok: true, id };
}

export async function setKeyStatus(id: string, status: KeyStatus, lastError?: string | null) {
  await ensureSchema();
  await db().execute({
    sql: "UPDATE api_keys SET status = ?, last_error = COALESCE(?, last_error), last_checked_at = ? WHERE id = ?",
    args: [status, lastError ?? null, new Date().toISOString(), id],
  });
}

export async function deleteKey(id: string) {
  await ensureSchema();
  await db().execute({ sql: "DELETE FROM api_keys WHERE id = ?", args: [id] });
}

export async function recordKeyUse(id: string, ok: boolean, error?: string) {
  await ensureSchema();
  await db().execute({
    sql: `UPDATE api_keys SET usage_count = usage_count + 1,
          success_count = success_count + ?, fail_count = fail_count + ?,
          last_used_at = ?, last_error = COALESCE(?, last_error) WHERE id = ?`,
    args: [ok ? 1 : 0, ok ? 0 : 1, new Date().toISOString(), ok ? null : (error ?? "error").slice(0, 300), id],
  });
}

export async function getKeyById(id: string): Promise<ApiKeyRow | null> {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT * FROM api_keys WHERE id = ?", args: [id] });
  return (r.rows[0] as unknown as ApiKeyRow) ?? null;
}
