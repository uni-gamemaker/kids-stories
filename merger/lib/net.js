// Safe remote downloads: public http(s) only (SSRF protection), size-capped, redirect-validated.
const dns = require("dns").promises;
const net = require("net");
const fs = require("fs");
const { MAX_FILE_BYTES } = require("./config");

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}
async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw Object.assign(new Error(`Not a valid URL: ${String(raw).slice(0, 80)}`), { status: 400 }); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw Object.assign(new Error("Only http/https links are allowed."), { status: 400 });
  if (process.env.ALLOW_PRIVATE_URLS === "1") return u;   // local tests only
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local")) throw Object.assign(new Error("Private or local addresses are not allowed."), { status: 400 });
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw Object.assign(new Error(`Could not resolve host: ${host}`), { status: 400 }); });
  if (addrs.some((a) => isPrivateIp(a.address))) throw Object.assign(new Error("Private or local addresses are not allowed."), { status: 400 });
  return u;
}
async function downloadTo(raw, path, budgetBytes) {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(url);
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(120_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location"), u).toString(); continue; }
    if (!res.ok) throw new Error(`Could not download a clip (HTTP ${res.status}).`);
    const limit = Math.min(MAX_FILE_BYTES, budgetBytes);
    if (Number(res.headers.get("content-length") || 0) > limit) throw new Error("A clip is larger than the allowed size.");
    const out = fs.createWriteStream(path);
    let n = 0;
    for await (const chunk of res.body) {
      n += chunk.length;
      if (n > limit) { out.destroy(); throw new Error("A clip is larger than the allowed size."); }
      if (!out.write(chunk)) await new Promise((ok) => out.once("drain", ok));
    }
    await new Promise((ok, bad) => { out.end(ok); out.on("error", bad); });
    return n;
  }
  throw new Error("Too many redirects while downloading a clip.");
}
module.exports = { assertPublicUrl, downloadTo, isPrivateIp };
