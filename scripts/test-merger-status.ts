import assert from "node:assert/strict";
import http from "node:http";
import { mergerStatus } from "../src/lib/merger";
const mk = (port: number, fn: (res: http.ServerResponse) => void) => http.createServer((_q, res) => fn(res)).listen(port);
(async () => {
  const servers = [
    mk(4961, (r) => { r.writeHead(200, { "content-type": "application/json" }); r.end(JSON.stringify({ maxSources: 10 })); }),
    mk(4962, (r) => { r.writeHead(401, { "content-type": "text/html" }); r.end("<title>Authentication Required</title>"); }),
    mk(4963, (r) => { r.writeHead(404); r.end("NOT_FOUND"); }),
    mk(4964, (r) => { r.writeHead(200, { "content-type": "text/html" }); r.end("<html>dashboard</html>"); }),
  ];
  const t = async (port: number, withSlash = false) => { process.env.MERGER_API_BASE = `http://localhost:${port}${withSlash ? "/" : ""}`; return mergerStatus(); };
  assert.equal((await t(4961, true)).healthy, true);                      // trailing slash tolerated
  assert.match((await t(4962)).detail, /Deployment Protection/);
  assert.match((await t(4963)).detail, /Root Directory/);
  assert.match((await t(4964)).detail, /not the merger/);
  assert.match((await t(4999)).detail, /Could not connect/);
  delete process.env.MERGER_API_BASE; assert.match((await mergerStatus()).detail, /not set/);
  console.log("merger status diagnostics OK");
  servers.forEach((s) => s.close()); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
