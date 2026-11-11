import assert from "node:assert/strict";
const URL_ = process.env.MCP_URL || "http://localhost:4810/mcp";
const H = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
let id = 0;
async function rpc(method: string, params: any = {}, token?: string) {
  const res = await fetch(URL_, { method: "POST", headers: { ...H, ...(token ? { "mcp-protocol-version": "2025-03-26" } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const text = await res.text();
  const msgs = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)));
  const j = msgs.length ? msgs : [JSON.parse(text)];
  return { status: res.status, all: j, final: j.find((m) => m.id === id) ?? j[j.length - 1] };
}
(async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  assert.equal(init.final.result.serverInfo.name, "kids-stories-media-mcp");
  const list = await rpc("tools/list");
  const names = list.final.result.tools.map((t: any) => t.name).sort();
  assert.deepEqual(names, ["generate_image", "generate_video", "get_task", "list_media", "merge_videos"]);
  const merge = list.final.result.tools.find((t: any) => t.name === "merge_videos").inputSchema.properties;
  assert.equal(merge.urls.maxItems, 10);
  assert.ok(!("resolution" in merge) && !("fps" in merge));
  console.log("tools/list OK:", names.join(", "));

  const img = await rpc("tools/call", { name: "generate_image", arguments: { prompt: "a cartoon boy", wait_seconds: 20 }, _meta: { progressToken: "p1" } });
  const txt = img.final.result.content[0].text;
  assert.match(txt, /Image generated successfully|being processed/);
  const progress = img.all.filter((m) => m.method === "notifications/progress");
  console.log("generate_image:", txt.split("\n")[0], "| progress notifications:", progress.length);

  const none = await rpc("tools/call", { name: "merge_videos", arguments: { urls: ["https://a/1.mp4"] } });
  assert.ok(none.final.error || none.final.result?.isError);
  const eleven = await rpc("tools/call", { name: "merge_videos", arguments: { urls: Array.from({ length: 11 }, (_, i) => `https://a/${i}.mp4`) } });
  assert.ok(eleven.final.error || eleven.final.result?.isError);
  const mr = await rpc("tools/call", { name: "merge_videos", arguments: { urls: ["https://a/1.mp4", "https://a/2.mp4"], wait_seconds: 15 } });
  assert.match(mr.final.result.content[0].text, /merged successfully/);
  const lm = await rpc("tools/call", { name: "list_media", arguments: {} });
  assert.match(lm.final.result.content[0].text, /newest first/);
  console.log("merge + list_media OK");
})().catch((e) => { console.error(e); process.exit(1); });
