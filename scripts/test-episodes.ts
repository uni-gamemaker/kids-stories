import assert from "node:assert/strict";
process.env.TURSO_DATABASE_URL = "file:/tmp/kids-ep.db";
import { saveEpisode, listEpisodes, getEpisode } from "../src/lib/episodes";
import { serveMcp, mcpAuthMode } from "../src/lib/mcp/handler";

const rpc = (method: string, params: any = {}) => new Request("http://x/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(process.env.TEST_AUTH ? { Authorization: process.env.TEST_AUTH } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
const toolNames = async (res: Response) => { const t = await res.text(); const l = t.split("\n").find((x) => x.startsWith("data:")); return JSON.parse(l ? l.slice(5) : t).result.tools.map((x: any) => x.name) as string[]; };

(async () => {
  // queue semantics: planned = oldest first (author's order), others newest first
  const a = await saveEpisode({ title: "Story A", story_text: "Once upon a time..." });
  const b = await saveEpisode({ title: "Story B", story_text: "Another story" });
  assert.ok(a.ok && b.ok); if (!a.ok || !b.ok) return;
  assert.deepEqual((await listEpisodes({ status: "planned" })).map((e) => e.title), ["Story A", "Story B"]);
  assert.equal((await saveEpisode({})).ok, false);                                   // new episode needs a title
  const u = await saveEpisode({ episode_id: a.episode.id, status: "published", caption: "Hi!", video_url: "https://v/1.mp4", scenes: [{ prompt: "p1" }] });
  assert.ok(u.ok && u.episode.status === "published" && u.episode.title === "Story A" && u.episode.story_text.startsWith("Once"));
  assert.deepEqual((await listEpisodes({ status: "planned" })).map((e) => e.title), ["Story B"]);   // A left the queue
  assert.equal((await getEpisode(a.episode.id))!.scenes.length, 1);
  assert.equal((await saveEpisode({ episode_id: "nope", status: "failed" })).ok, false);
  console.log("episodes OK");

  // MCP access modes
  delete process.env.MCP_URL_SECRET; delete process.env.MCP_ACCESS_TOKEN;
  assert.equal(mcpAuthMode(), "open");
  const names = await toolNames(await serveMcp(rpc("tools/list")));
  for (const n of ["save_episode", "list_episodes", "get_episode", "generate_image", "generate_video", "merge_videos"]) assert.ok(names.includes(n), n);
  console.log("tools:", names.length);

  process.env.MCP_ACCESS_TOKEN = "tok";
  assert.equal(mcpAuthMode(), "bearer");
  assert.equal((await serveMcp(rpc("tools/list"))).status, 401);
  process.env.TEST_AUTH = "Bearer tok";
  assert.equal((await serveMcp(rpc("tools/list"))).status, 200);
  delete process.env.TEST_AUTH; delete process.env.MCP_ACCESS_TOKEN;

  process.env.MCP_URL_SECRET = "s3cret-path-value";
  assert.equal(mcpAuthMode(), "secret-url");
  assert.equal((await serveMcp(rpc("tools/list"))).status, 404);                       // plain /mcp is closed
  assert.equal((await serveMcp(rpc("tools/list"), "wrong")).status, 404);
  assert.equal((await serveMcp(rpc("tools/list"), "s3cret-path-value-x")).status, 404);
  assert.equal((await serveMcp(rpc("tools/list"), "s3cret-path-value")).status, 200);
  console.log("auth modes OK (open / bearer / secret-url)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
