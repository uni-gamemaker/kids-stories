// End-to-end test of the merger API against the local dev server, with real ffmpeg.
const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
process.env.TURSO_DATABASE_URL = "file:/tmp/merger-test.db";
process.env.ALLOW_PRIVATE_URLS = "1";
try { fs.unlinkSync("/tmp/merger-test.db"); } catch {}
const ff = require("../lib/ffmpeg");
const { isPrivateIp } = require("../lib/net");

const dir = fs.mkdtempSync("/tmp/clips-");
const gen = (name, size, audio, secs) => execFileSync(ff.FFMPEG(), ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=25:duration=${secs}`,
  ...(audio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${secs}`, "-c:a", "aac"] : []), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", path.join(dir, name)]);
gen("a.mp4", "640x360", true, 2); gen("b.mp4", "320x568", false, 2); gen("c.mp4", "160x120", true, 1);
fs.writeFileSync(path.join(dir, "notvideo.mp4"), "this is not a video file");

const files = http.createServer((q, s) => { const f = path.join(dir, q.url.slice(1)); fs.existsSync(f) ? (s.writeHead(200), fs.createReadStream(f).pipe(s)) : (s.writeHead(404), s.end()); }).listen(4931);
const app = require("../server").listen(4930);
const B = "http://localhost:4930", F = "http://localhost:4931";
const post = (p, body, raw) => fetch(B + p, { method: "POST", headers: raw ? { "Content-Type": "application/octet-stream" } : { "Content-Type": "application/json" }, body: raw ? body : JSON.stringify(body) });

(async () => {
  // private-address protection (unit)
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "169.254.169.254", "172.16.0.1", "::1", "fc00::1"]) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ["8.8.8.8", "93.184.216.34"]) assert.ok(!isPrivateIp(ip), ip);

  const cfg = await (await fetch(B + "/api/config")).json();
  assert.equal(cfg.maxSources, 10);

  // validation
  assert.equal((await post("/api/jobs", { videos: [] })).status, 400);
  assert.equal((await post("/api/jobs", { videos: [`${F}/a.mp4`] })).status, 400);
  assert.equal((await post("/api/jobs", { videos: Array.from({ length: 11 }, () => `${F}/a.mp4`) })).status, 400);
  assert.equal((await post("/api/jobs", { videos: ["ftp://x/a.mp4", `${F}/a.mp4`] })).status, 400);
  assert.equal((await post("/api/jobs", "{not json", true)).status, 400);
  assert.equal((await (await fetch(B + "/api/jobs/zzzz")).json()).error.includes("not found"), true);

  // URL job: mixed resolutions, one clip without audio
  const c = await (await post("/api/jobs", { videos: [`${F}/a.mp4`, `${F}/b.mp4`, `${F}/c.mp4`] })).json();
  assert.equal(c.status, "queued");
  const p = await post(`/api/jobs/${c.jobId}/process`, {});
  const pj = await p.json();
  assert.equal(p.status, 200, JSON.stringify(pj));
  assert.equal(pj.status, "done");
  assert.equal((await post(`/api/jobs/${c.jobId}/process`, {})).status, 200); // idempotent
  const st = await (await fetch(`${B}/api/jobs/${c.jobId}`)).json();
  assert.equal(st.status, "done"); assert.ok(st.videoUrl.endsWith("/video"));
  const full = Buffer.from(await (await fetch(st.videoUrl)).arrayBuffer());
  assert.equal(full.length, st.size);
  const r = await fetch(st.videoUrl, { headers: { Range: "bytes=0-99" } });
  assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), `bytes 0-99/${st.size}`);
  assert.equal((await fetch(st.videoUrl, { headers: { Range: `bytes=${st.size + 5}-` } })).status, 416);
  const outFile = path.join(dir, "out.mp4"); fs.writeFileSync(outFile, full);
  const info = JSON.parse(execFileSync(ff.FFPROBE(), ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", outFile]));
  const v = info.streams.find((s) => s.codec_type === "video"), a = info.streams.find((s) => s.codec_type === "audio");
  assert.equal(`${v.width}x${v.height}`, "640x360"); assert.ok(a, "audio kept even though clip b had none");
  assert.ok(Math.abs(Number(info.format.duration) - 5) < 0.4, "duration " + info.format.duration);
  console.log(`URL merge OK: ${v.width}x${v.height}, ${Number(info.format.duration).toFixed(1)}s, audio present, ${(st.size / 1024).toFixed(0)} KB`);

  // mixed job: link + uploaded file; processing early must be refused
  const bsize = fs.statSync(path.join(dir, "b.mp4")).size;
  const m = await (await post("/api/jobs", { sources: [{ kind: "url", url: `${F}/a.mp4` }, { kind: "file", name: "b.mp4", size: bsize, mime: "video/mp4" }] })).json();
  assert.equal(m.status, "uploading"); assert.equal(m.uploads[0].seq, 1);
  assert.equal((await post(`/api/jobs/${m.jobId}/process`, {})).status, 409);
  const up = await (await post(`/api/upload?job=${m.jobId}&seq=1&chunk=0`, fs.readFileSync(path.join(dir, "b.mp4")), true)).json();
  assert.equal(up.complete, true);
  const mp = await post(`/api/jobs/${m.jobId}/process`, {});
  assert.equal(mp.status, 200, JSON.stringify(await mp.clone().json()));
  console.log("mixed link+upload merge OK");

  // not a video -> clean failure, then 409 on retry
  const nv = await (await post("/api/jobs", { videos: [`${F}/a.mp4`, `${F}/notvideo.mp4`] })).json();
  const nr = await post(`/api/jobs/${nv.jobId}/process`, {});
  const nj = await nr.json();
  assert.ok(nr.status >= 400 && /not a valid video/i.test(nj.error), JSON.stringify(nj));
  assert.equal((await fetch(`${B}/api/jobs/${nv.jobId}`).then((x) => x.json())).status, "failed");
  assert.equal((await post(`/api/jobs/${nv.jobId}/process`, {})).status, 409);
  const dead = await post("/api/jobs", { videos: [`${F}/missing.mp4`, `${F}/a.mp4`] });
  const dj = await (await post(`/api/jobs/${(await dead.json()).jobId}/process`, {})).json();
  assert.match(dj.error, /download/i);
  console.log("invalid / unreachable clips fail cleanly");

  // delete + expiry cleanup
  assert.equal((await fetch(`${B}/api/jobs/${c.jobId}`, { method: "DELETE" })).status, 200);
  assert.equal((await fetch(`${B}/api/jobs/${c.jobId}`)).status, 404);
  assert.equal((await fetch(st.videoUrl)).status, 404);
  const { db } = require("../lib/db");
  await db().execute({ sql: "UPDATE merge_jobs SET expires_at=? WHERE id=?", args: ["2000-01-01T00:00:00.000Z", m.jobId] });
  const cr = await (await fetch(B + "/api/cron")).json();
  assert.ok(cr.deleted >= 1);
  assert.equal((await fetch(`${B}/api/jobs/${m.jobId}`)).status, 404);
  console.log("delete + 24h expiry cleanup OK");
  app.close(); files.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
