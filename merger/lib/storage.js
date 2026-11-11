const fs = require("fs");
const { db, ensureSchema } = require("./db");
const { ROW_BYTES } = require("./config");

async function putSourceChunk(jobId, seq, chunkNo, buf, chunkBytes) {
  await ensureSchema();
  const per = chunkBytes / ROW_BYTES;
  const stmts = [];
  for (let i = 0; i * ROW_BYTES < buf.length; i++) {
    stmts.push({ sql: "INSERT OR REPLACE INTO merge_source_chunks (job_id, seq, idx, data) VALUES (?,?,?,?)",
      args: [jobId, seq, chunkNo * per + i, buf.subarray(i * ROW_BYTES, (i + 1) * ROW_BYTES)] });
  }
  await db().batch(stmts, "write");
}
async function countSourceBytes(jobId, seq) {
  const r = await db().execute({ sql: "SELECT COALESCE(SUM(LENGTH(data)),0) AS n FROM merge_source_chunks WHERE job_id=? AND seq=?", args: [jobId, seq] });
  return Number(r.rows[0].n);
}
// Reassemble an uploaded source into a local file, page by page (bounded memory).
async function sourceToFile(jobId, seq, path) {
  const out = fs.createWriteStream(path);
  let idx = -1;
  for (;;) {
    const r = await db().execute({ sql: "SELECT idx, data FROM merge_source_chunks WHERE job_id=? AND seq=? AND idx>? ORDER BY idx LIMIT 8", args: [jobId, seq, idx] });
    if (!r.rows.length) break;
    for (const row of r.rows) { if (!out.write(Buffer.from(row.data))) await new Promise((ok) => out.once("drain", ok)); idx = Number(row.idx); }
  }
  await new Promise((ok, bad) => { out.end(ok); out.on("error", bad); });
}
async function fileToOutput(jobId, path) {
  const fd = fs.openSync(path, "r");
  try {
    const buf = Buffer.alloc(ROW_BYTES);
    let idx = 0, n;
    await db().execute({ sql: "DELETE FROM merge_output_chunks WHERE job_id=?", args: [jobId] });
    while ((n = fs.readSync(fd, buf, 0, ROW_BYTES, idx * ROW_BYTES)) > 0) {
      await db().execute({ sql: "INSERT INTO merge_output_chunks (job_id, idx, data) VALUES (?,?,?)", args: [jobId, idx, Buffer.from(buf.subarray(0, n))] });
      idx++;
    }
  } finally { fs.closeSync(fd); }
}
async function readOutputRange(jobId, start, end) {
  const a = Math.floor(start / ROW_BYTES), b = Math.floor(end / ROW_BYTES);
  const r = await db().execute({ sql: "SELECT idx, data FROM merge_output_chunks WHERE job_id=? AND idx BETWEEN ? AND ? ORDER BY idx", args: [jobId, a, b] });
  const whole = Buffer.concat(r.rows.map((x) => Buffer.from(x.data)));
  const off = start - a * ROW_BYTES;
  return whole.subarray(off, off + (end - start + 1));
}
async function deleteJobData(jobId) {
  await db().batch([
    { sql: "DELETE FROM merge_source_chunks WHERE job_id=?", args: [jobId] },
    { sql: "DELETE FROM merge_output_chunks WHERE job_id=?", args: [jobId] },
    { sql: "DELETE FROM merge_sources WHERE job_id=?", args: [jobId] },
    { sql: "DELETE FROM merge_jobs WHERE id=?", args: [jobId] },
  ], "write");
}
async function cleanupExpired() {
  const r = await db().execute({ sql: "SELECT id FROM merge_jobs WHERE expires_at < ?", args: [new Date().toISOString()] });
  for (const row of r.rows) await deleteJobData(String(row.id));
  return r.rows.length;
}
module.exports = { putSourceChunk, countSourceBytes, sourceToFile, fileToOutput, readOutputRange, deleteJobData, cleanupExpired };
