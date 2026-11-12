const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function bin(envVar, getter, name) {
  if (process.env[envVar]) return process.env[envVar];
  const src = getter();
  const dst = path.join(os.tmpdir(), name);
  try { if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); fs.chmodSync(dst, 0o755); } return dst; } catch { return src; }
}
const FFMPEG = () => bin("FFMPEG_PATH", () => require("ffmpeg-static"), "ffmpeg-bin");

function run(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; if (onLine) String(d).split("\n").forEach(onLine); });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 300) || `exit ${code}`))));
  });
}

// Probe with ffmpeg itself (no separate ffprobe binary: keeps the Vercel bundle far below its size limit).
function probeText(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG(), ["-hide_banner", "-i", file]);
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", () => resolve(err)); // ffmpeg exits non-zero when no output is given: expected
  });
}
async function probe(file) {
  const t = await probeText(file);
  const d = t.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = t.match(/Stream #\d+:\d+[^\n]*?: Video:[^\n]*?[\s,](\d{2,5})x(\d{2,5})(?=[\s,\[]|$)/);
  if (!d || !v) throw new Error("A file is not a valid video.");
  const duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  if (!(duration > 0)) throw new Error("A file is not a valid video.");
  return { width: Number(v[1]), height: Number(v[2]), duration, hasAudio: /Stream #\d+:\d+[^\n]*?: Audio:/.test(t) };
}

const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
// Output size = first clip's size (capped at 1280x720 box), other clips are letterboxed to it.
function targetSize(first) {
  let { width: w, height: h } = first;
  const k = Math.min(1, 1280 / w, 1280 / h, 1280 / Math.max(w, h));
  return { w: even(w * k), h: even(h * k) };
}

async function merge(files, infos, outPath, onProgress) {
  const { w, h } = targetSize(infos[0]);
  const total = infos.reduce((s, i) => s + i.duration, 0);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats"];
  files.forEach((f) => args.push("-i", f));
  const parts = [];
  infos.forEach((info, i) => {
    parts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
    // Clips without audio get silence of the same length so concat keeps audio in sync.
    parts.push(info.hasAudio
      ? `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`
      : `anullsrc=r=44100:cl=stereo,atrim=duration=${info.duration.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
  });
  parts.push(infos.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${infos.length}:v=1:a=1[v][a]`);
  args.push("-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outPath);
  await run(FFMPEG(), args, (line) => {
    const m = line.match(/^out_time_ms=(\d+)/);
    if (m && onProgress) onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
  });
  return { width: w, height: h, duration: total };
}
module.exports = { probe, merge, FFMPEG };
