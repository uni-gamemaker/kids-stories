// Mock kie.ai + merger servers for offline tests.
import http from "node:http";

export function startMocks(kiePort: number, mergerPort: number) {
  const polls: Record<string, number> = {};
  let n = 0;
  const kie = http.createServer((req, res) => {
    const auth = (req.headers.authorization || "").replace("Bearer ", "");
    const send = (s: number, b: unknown) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      if (req.url!.startsWith("/api/v1/jobs/createTask")) {
        if (auth === "bad-key-000000") return send(401, { code: 401, msg: "Invalid API key" });
        if (auth === "poor-key-00000") return send(200, { code: 402, msg: "Insufficient credits" });
        if (auth === "params-key-000") return send(422, { code: 422, msg: "bad aspect_ratio" });
        const id = `${auth}-${++n}`; polls[id] = 0;
        return send(200, { code: 200, data: { taskId: id } });
      }
      if (req.url!.startsWith("/api/v1/jobs/recordInfo")) {
        const id = new URL(req.url!, "http://x").searchParams.get("taskId")!;
        polls[id] = (polls[id] ?? 0) + 1;
        if (id.startsWith("midfail")) return send(200, { code: 200, data: { state: "fail", failMsg: "insufficient balance" } });
        if (polls[id] < 2) return send(200, { code: 200, data: { state: "generating" } });
        return send(200, { code: 200, data: { state: "success", resultJson: JSON.stringify({ resultUrls: [`https://cdn.example/img-${id.length}-${polls[id]}.png`] }) } });
      }
      send(404, { code: 404, msg: "not found" });
    });
  }).listen(kiePort);

  const jobs: Record<string, string> = {};
  const merger = http.createServer((req, res) => {
    const send = (s: number, b: unknown) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const u = req.url!;
      if (u === "/api/config") return send(200, { maxSources: 10 });
      if (req.method === "POST" && u === "/api/jobs") { const id = "job" + Object.keys(jobs).length; jobs[id] = "queued"; return send(201, { jobId: id, status: "queued" }); }
      const m = u.match(/^\/api\/jobs\/(\w+)(\/process)?$/);
      if (m && req.method === "POST" && m[2]) { setTimeout(() => { jobs[m[1]] = "done"; send(200, { status: "done", videoUrl: `http://localhost:${mergerPort}/api/jobs/${m[1]}/video` }); }, 400); return; }
      if (m && req.method === "GET") return jobs[m[1]] ? send(200, { status: jobs[m[1]], progress: jobs[m[1]] === "done" ? 100 : 10, ...(jobs[m[1]] === "done" ? { videoUrl: `http://localhost:${mergerPort}/api/jobs/${m[1]}/video` } : {}) }) : send(404, { error: "not found" });
      send(404, { error: "nope" });
    });
  }).listen(mergerPort);
  return { close: () => { kie.close(); merger.close(); } };
}
