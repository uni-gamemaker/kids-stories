import { db, ensureSchema } from "./turso";

export async function getSetting(key: string): Promise<string | null> {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT value FROM settings WHERE key=?", args: [key] });
  return r.rows[0] ? String((r.rows[0] as any).value) : null;
}
export async function setSetting(key: string, value: string): Promise<void> {
  await ensureSchema();
  await db().execute({ sql: "INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", args: [key, value, new Date().toISOString()] });
}
