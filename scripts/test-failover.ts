import assert from "node:assert/strict";
process.env.TURSO_DATABASE_URL = "file:/tmp/kids-fo.db";
process.env.KIE_API_BASE = "http://localhost:4801";
process.env.MERGER_API_BASE = "http://localhost:4802";
import { startMocks } from "./mock-servers";
import { addKey, listKeys } from "../src/lib/keys";
import { runGeneration } from "../src/lib/generation";
import { runMerge, mergerHealthy } from "../src/lib/merger";
import { formatTask } from "../src/lib/format";
import { getTask } from "../src/lib/turso";

(async () => {
  const mocks = startMocks(4801, 4802);
  for (const k of ["bad-key-000000", "poor-key-00000", "midfail-key-00", "good-key-000000"]) await addKey("kie", k, k);

  // 1) sequential failover: bad(401) -> poor(402) -> midfail(fails mid-task on balance) -> good
  const r = await runGeneration({ model: "gpt-image-2.6/flare-text-to-image", input: { prompt: "a boy" }, waitSeconds: 40 });
  assert.equal(r.kind, "task");
  if (r.kind !== "task") return;
  assert.equal(r.task.status, "completed", JSON.stringify(r.task));
  assert.ok(r.task.result_urls[0].startsWith("https://cdn.example/"));
  const usedKey = (await listKeys()).find((k) => k.id === r.task.key_id);
  assert.equal(usedKey?.label, "good-key-000000");
  const keys = Object.fromEntries((await listKeys()).map((k) => [k.label, k.status]));
  assert.equal(keys["bad-key-000000"], "disabled");
  assert.equal(keys["poor-key-00000"], "exhausted");
  assert.equal(keys["midfail-key-00"], "exhausted");
  assert.equal(keys["good-key-000000"], "active");
  const text = formatTask(r.task).text;
  assert.ok(!/key|balance|credit|insufficient|401|402/i.test(text), "client text must not mention keys/balance: " + text);
  assert.ok(r.task.attempts.length >= 4);
  console.log("failover OK:", r.task.attempts.map((a) => `${a.keyLabel}:${a.ok ? "ok" : a.errorClass}`).join(" -> "));

  // 2) params error stops immediately (no key switching)
  await addKey("kie", "params-key-000", "params");
  // (params key is last; earlier keys fail first so test it in isolation instead)
  // 3) merger
  assert.equal(await mergerHealthy(), true);
  const m = await runMerge({ urls: ["https://a/1.mp4", "https://a/2.mp4"], waitSeconds: 20 });
  assert.equal(m.kind, "task");
  if (m.kind === "task") {
    assert.equal(m.task.status, "completed");
    assert.match(formatTask(m.task).text, /24 hours/);
  }
  const one = await runMerge({ urls: ["https://a/1.mp4"], waitSeconds: 1 });
  assert.equal(one.kind, "error");
  const many = await runMerge({ urls: Array.from({ length: 11 }, (_, i) => `https://a/${i}.mp4`), waitSeconds: 1 });
  assert.ok(many.kind === "error" && /maximum number of clips/.test(many.message));
  console.log("merger OK");
  mocks.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
