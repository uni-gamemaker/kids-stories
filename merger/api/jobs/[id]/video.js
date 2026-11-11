const { jobId, queryOf, send, handler, CORS } = require("../../../lib/http");
const { getJob } = require("../../../lib/jobs");
const { readOutputRange } = require("../../../lib/storage");
const SLICE = 4 * 1024 * 1024;
module.exports = handler(async (req, res) => {
  const id = jobId(req);
  const j = id && (await getJob(id));
  if (!j || j.status !== "done") return send(res, 404, { error: "Video not found (it may have expired after 24 hours)." });
  const size = Number(j.output_size);
  const h = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600", ...CORS };
  if (queryOf(req).download) h["Content-Disposition"] = 'attachment; filename="merged-video.mp4"';
  let start = 0, end = size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (m && (m[1] || m[2])) {
    if (m[1] === "") { start = Math.max(0, size - Number(m[2])); } else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
    if (start >= size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${size}`, ...CORS }); return res.end(); }
    status = 206; h["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  h["Content-Length"] = end - start + 1;
  res.writeHead(status, h);
  if (req.method === "HEAD") return res.end();
  for (let pos = start; pos <= end; pos += SLICE) res.write(await readOutputRange(id, pos, Math.min(end, pos + SLICE - 1)));
  res.end();
});
