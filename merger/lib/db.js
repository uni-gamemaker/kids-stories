const { createClient } = require("@libsql/client");
let client, ready;
function db() {
  if (!client) {
    if (!process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is not set");
    client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS merge_jobs (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, progress INTEGER DEFAULT 0, error TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL,
    output_size INTEGER, output_duration REAL, output_resolution TEXT)`,
  `CREATE TABLE IF NOT EXISTS merge_sources (
    job_id TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, url TEXT, name TEXT, size INTEGER, mime TEXT,
    uploaded INTEGER DEFAULT 0, PRIMARY KEY (job_id, seq))`,
  `CREATE TABLE IF NOT EXISTS merge_source_chunks (
    job_id TEXT NOT NULL, seq INTEGER NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (job_id, seq, idx))`,
  `CREATE TABLE IF NOT EXISTS merge_output_chunks (
    job_id TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (job_id, idx))`,
];
function ensureSchema() {
  if (!ready) ready = (async () => { for (const s of SCHEMA) await db().execute(s); })().catch((e) => { ready = null; throw e; });
  return ready;
}
module.exports = { db, ensureSchema };
