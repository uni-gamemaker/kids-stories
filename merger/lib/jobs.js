const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { db, ensureSchema } = require("./db");
const C = require("./config");
const { assertPublicUrl, downloadTo } = require("./net");
const { sourceToFile, fileToOutput, deleteJobData, cleanupExpired } = require("./storage");
const { probe, merge } = require("./ffmpeg");

const newId = () => Array.from(crypto.randomBytes(12), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const now = () => new Date().toISOString();
const bad = (m, status = 400) => Object.assign(new Error(m), { status });

async function createJob(body) {
  await ensureSchema();
  await cleanupExpired().catch(() => {});
  let sources = [];
  if (body && Array.isArray(body.videos)) sources = body.videos.map((url) => ({ kind: "url", url }));
  else if (body && Array.isArray(body.sources)) sources = body.sources;
  else throw bad("Send {\"videos\": [url, url, ...]} or {\"sources\": [...]}.");
  if (sources.length < C.MIN_SOURCES) throw bad(`Merging needs at least ${C.MIN_SOURCES} clips.`);
  if (sources.length > C.MAX_SOURCES) throw bad(`The maximum number of clips is ${C.MAX_SOURCES}.`);
  let declared = 0;
  for (const s of sources) {
    if (s.kind === "url") { await assertPublicUrl(s.url); }
    else if (s.kind === "file") {
      if (!Number.isFinite(s.size) || s.size <= 0) throw bad("Each uploaded file needs a size in bytes.");
      if (s.size > C.MAX_FILE_BYTES) throw bad(`A file is larger than ${Math.round(C.MAX_FILE_BYTES / 1048576)} MB.`);
      if (s.mime && !String(s.mime).startsWith("video/")) throw bad("Only video files can be uploaded.");
      declared += s.size;
    } else throw bad("Each source must have kind \"url\" or \"file\".");
  }
  if (declared > C.MAX_TOTAL_BYTES) throw bad(`The total upload size exceeds ${Math.round(C.MAX_TOTAL_BYTES / 1048576)} MB.`);
  const id = newId();
  const hasFiles = sources.some((s) => s.kind === "file");
  const t = now(), exp = new Date(Date.now() + C.TTL_HOURS * 3600e3).toISOString();
  await db().batch([
    { sql: "INSERT INTO merge_jobs (id, status, progress, created_at, updated_at, expires_at) VALUES (?,?,?,?,?,?)", args: [id, hasFiles ? "uploading" : "queued", 0, t, t, exp] },
    ...sources.map((s, seq) => ({ sql: "INSERT INTO merge_sources (job_id, seq, kind, url, name, size, mime, uploaded) VALUES (?,?,?,?,?,?,?,?)",
      args: [id, seq, s.kind, s.kind === "url" ? s.url : null, s.name ? String(s.name).slice(0, 120) : null, s.kind === "file" ? s.size : null, s.mime || null, s.kind === "url" ? 1 : 0] })),
  ], "write");
  const uploads = sources.map((s, seq) => s.kind === "file" ? { seq, chunks: Math.ceil(s.size / C.UPLOAD_CHUNK_BYTES), uploadUrl: `/api/upload?job=${id}&seq=${seq}` } : null).filter(Boolean);
  return { jobId: id, status: hasFiles ? "uploading" : "queued", ...(hasFiles ? { uploads, chunkBytes: C.UPLOAD_CHUNK_BYTES } : {}), expiresAt: exp };
}

async function getJob(id) {
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT * FROM merge_jobs WHERE id=?", args: [id] });
  return r.rows[0] || null;
}
async function setJob(id, patch) {
  const keys = Object.keys(patch);
  await db().execute({ sql: `UPDATE merge_jobs SET ${keys.map((k) => `${k}=?`).join(",")}, updated_at=? WHERE id=?`, args: [...keys.map((k) => patch[k]), now(), id] });
}
const view = (j, base) => ({
  jobId: j.id, status: j.status, progress: Number(j.progress || 0), ...(j.error ? { error: j.error } : {}),
  expiresAt: j.expires_at,
  ...(j.status === "done" ? { videoUrl: `${base}/api/jobs/${j.id}/video`, downloadUrl: `${base}/api/jobs/${j.id}/video?download=1`, size: Number(j.output_size), duration: Number(j.output_duration), resolution: j.output_resolution } : {}),
});

// Mark an uploaded source complete when all of its bytes have arrived.
async function refreshUploadState(id) {
  const left = await db().execute({ sql: "SELECT COUNT(*) AS n FROM merge_sources WHERE job_id=? AND uploaded=0", args: [id] });
  if (Number(left.rows[0].n) === 0) await db().execute({ sql: "UPDATE merge_jobs SET status='queued', updated_at=? WHERE id=? AND status='uploading'", args: [now(), id] });
}

// Returns {code, body}: 200 done, 202 already processing, 409 wrong state, 4xx/5xx errors.
async function processJob(id, base) {
  let j = await getJob(id);
  if (!j) return { code: 404, body: { error: "Job not found (it may have expired after 24 hours)." } };
  if (j.status === "done") return { code: 200, body: view(j, base) };
  if (j.status === "failed") return { code: 409, body: { error: j.error || "This job has already failed." } };
  if (j.status === "uploading") return { code: 409, body: { error: "Uploads are not complete yet." } };
  if (j.status === "processing" && Date.now() - Date.parse(String(j.updated_at)) < C.STALE_PROCESSING_MS) return { code: 202, body: view(j, base) };
  // Atomic claim so two callers never process the same job.
  const claim = await db().execute({ sql: "UPDATE merge_jobs SET status='processing', progress=1, updated_at=? WHERE id=? AND (status='queued' OR status='processing')", args: [now(), id] });
  if (!claim.rowsAffected) return { code: 202, body: view(await getJob(id), base) };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-"));
  try {
    const src = (await db().execute({ sql: "SELECT * FROM merge_sources WHERE job_id=? ORDER BY seq", args: [id] })).rows;
    const files = [];
    let used = 0;
    for (const [i, s] of src.entries()) {
      const f = path.join(dir, `in${i}.bin`);
      if (s.kind === "url") used += await downloadTo(String(s.url), f, C.MAX_TOTAL_BYTES - used);
      else { await sourceToFile(id, Number(s.seq), f); used += fs.statSync(f).size; }
      if (used > C.MAX_TOTAL_BYTES) throw new Error("The clips together are larger than the allowed size.");
      files.push(f);
      await setJob(id, { progress: Math.round(((i + 1) / src.length) * 35) });
    }
    const infos = [];
    for (const f of files) infos.push(await probe(f));
    const total = infos.reduce((a, b) => a + b.duration, 0);
    if (total > C.MAX_TOTAL_SECONDS) throw new Error(`The total duration (${Math.round(total)}s) exceeds the ${C.MAX_TOTAL_SECONDS}s limit.`);
    const out = path.join(dir, "out.mp4");
    let last = 0;
    const meta = await merge(files, infos, out, (p) => { const pr = 35 + Math.round(p * 55); if (pr - last >= 5) { last = pr; setJob(id, { progress: pr }).catch(() => {}); } });
    const size = fs.statSync(out).size;
    if (size > C.MAX_OUTPUT_BYTES) throw new Error("The merged video is larger than the allowed output size.");
    await fileToOutput(id, out);
    await db().batch([{ sql: "DELETE FROM merge_source_chunks WHERE job_id=?", args: [id] }], "write");
    await setJob(id, { status: "done", progress: 100, output_size: size, output_duration: meta.duration, output_resolution: `${meta.width}x${meta.height}`, error: null });
    return { code: 200, body: view(await getJob(id), base) };
  } catch (e) {
    const msg = e.message || "Merging failed.";
    await setJob(id, { status: "failed", error: msg.slice(0, 300) }).catch(() => {});
    return { code: e.status || 500, body: { error: msg } };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { createJob, getJob, processJob, view, setJob, refreshUploadState, deleteJobData };
