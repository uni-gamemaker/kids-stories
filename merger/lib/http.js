// Plain Node (req, res) helpers: identical behaviour on Vercel and in the local dev server.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
function send(res, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS, ...headers });
  res.end(data);
}
function preflight(req, res) {
  if (req.method !== "OPTIONS") return false;
  res.writeHead(204, CORS); res.end(); return true;
}
function jobId(req) { const m = (req.url || "").match(/^\/api\/jobs\/([a-z0-9]+)/); return m ? m[1] : null; }
function queryOf(req) { return Object.fromEntries(new URL(req.url, "http://x").searchParams); }
async function readRaw(req, limit) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const parts = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error("Request body too large."), { status: 413 }); parts.push(c); }
  return Buffer.concat(parts);
}
async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRaw(req, 1024 * 1024);
  try { return JSON.parse(raw.toString("utf8") || "null"); }
  catch { throw Object.assign(new Error("Malformed JSON body."), { status: 400 }); }
}
// Wrap a handler so thrown errors become clean JSON responses (never raw stack traces).
const handler = (fn) => async (req, res) => {
  if (preflight(req, res)) return;
  try { await fn(req, res); }
  catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "Internal error." }); if (!e.status) console.error(e); }
};
module.exports = { send, preflight, jobId, queryOf, readRaw, readJson, handler, CORS };
