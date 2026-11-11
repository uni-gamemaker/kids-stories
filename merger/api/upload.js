const { send, queryOf, readRaw, handler } = require("../lib/http");
const { db, ensureSchema } = require("../lib/db");
const C = require("../lib/config");
const { putSourceChunk, countSourceBytes } = require("../lib/storage");
const { getJob, refreshUploadState } = require("../lib/jobs");
module.exports = handler(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  await ensureSchema();
  const q = queryOf(req), seq = Number(q.seq), chunk = Number(q.chunk ?? 0);
  const j = await getJob(String(q.job || ""));
  if (!j || j.status !== "uploading") return send(res, 409, { error: "This job is not accepting uploads." });
  const s = (await db().execute({ sql: "SELECT * FROM merge_sources WHERE job_id=? AND seq=? AND kind='file'", args: [j.id, seq] })).rows[0];
  if (!s) return send(res, 404, { error: "Unknown upload slot." });
  const buf = await readRaw(req, C.UPLOAD_CHUNK_BYTES + 1024);
  if (!buf.length) return send(res, 400, { error: "Empty chunk." });
  if (chunk < 0 || chunk >= Math.ceil(Number(s.size) / C.UPLOAD_CHUNK_BYTES)) return send(res, 400, { error: "Chunk number out of range." });
  await putSourceChunk(j.id, seq, chunk, buf, C.UPLOAD_CHUNK_BYTES);
  const have = await countSourceBytes(j.id, seq);
  if (have > Number(s.size)) return send(res, 400, { error: "Uploaded more bytes than declared." });
  const complete = have === Number(s.size);
  if (complete) { await db().execute({ sql: "UPDATE merge_sources SET uploaded=1 WHERE job_id=? AND seq=?", args: [j.id, seq] }); await refreshUploadState(j.id); }
  send(res, 200, { received: have, complete });
});
