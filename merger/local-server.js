// Local dev server that mirrors the Vercel routes: `node local-server.js` (needs TURSO_DATABASE_URL, e.g. file:./dev.db).
const http = require("http");
const fs = require("fs");
const path = require("path");
const routes = [
  [/^\/api\/config$/, "./api/config.js"],
  [/^\/api\/upload$/, "./api/upload.js"],
  [/^\/api\/cron$/, "./api/cron.js"],
  [/^\/api\/jobs$/, "./api/jobs/index.js"],
  [/^\/api\/jobs\/[a-z0-9]+\/process$/, "./api/jobs/[id]/process.js"],
  [/^\/api\/jobs\/[a-z0-9]+\/video$/, "./api/jobs/[id]/video.js"],
  [/^\/api\/jobs\/[a-z0-9]+$/, "./api/jobs/[id]/index.js"],
];
const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const hit = routes.find(([re]) => re.test(p));
  if (hit) return require(hit[1])(req, res);
  const file = path.join(__dirname, "public", p === "/" ? "index.html" : p);
  if (file.startsWith(path.join(__dirname, "public")) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { "Content-Type": file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not found." }));
});
if (require.main === module) server.listen(process.env.PORT || 3100, () => console.log(`merger on http://localhost:${process.env.PORT || 3100}`));
module.exports = server;
