// Main app (runMerge) against the REAL merger/ server with real ffmpeg.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
process.env.TURSO_DATABASE_URL = "file:/tmp/kids-int.db";
process.env.MERGER_API_BASE = "http://localhost:4940";
process.env.MERGER_DB = "file:/tmp/merger-int.db";
import { runMerge } from "../src/lib/merger";
import { formatTask } from "../src/lib/format";

(async () => {
  const dir = fs.mkdtempSync("/tmp/int-");
  for (const [n, sz] of [["1.mp4", "640x360"], ["2.mp4", "640x360"]]) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=${sz}:rate=25:duration=2`, "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", `${dir}/${n}`]);
  const files = http.createServer((q, s) => { const f = dir + q.url; fs.existsSync(f) ? (s.writeHead(200), fs.createReadStream(f).pipe(s)) : (s.writeHead(404), s.end()); }).listen(4941);
  process.env.TURSO_DATABASE_URL = "file:/tmp/kids-int.db";
  // merger child uses its own DB env
  const { spawn } = await import("node:child_process");
  const srv = spawn("node", ["server.js"], { cwd: "merger", env: { ...process.env, TURSO_DATABASE_URL: "file:/tmp/merger-int.db", ALLOW_PRIVATE_URLS: "1", PORT: "4940" }, stdio: "inherit" });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await runMerge({ urls: ["http://localhost:4941/1.mp4", "http://localhost:4941/2.mp4"], waitSeconds: 40 });
  assert.equal(r.kind, "task");
  if (r.kind === "task") {
    assert.equal(r.task.status, "completed", JSON.stringify(r.task));
    const res = await fetch(r.task.result_urls[0], { headers: { Range: "bytes=0-9" } });
    assert.equal(res.status, 206);
    console.log("integration OK:", formatTask(r.task).text.split("\n")[0], "->", r.task.result_urls[0]);
  }
  srv.kill(); files.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
