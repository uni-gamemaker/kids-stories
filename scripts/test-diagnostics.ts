import assert from "node:assert/strict";
process.env.TURSO_DATABASE_URL = "file:/tmp/kids-diag.db";
process.env.KIE_API_BASE = "http://localhost:4851";
import { startMocks } from "./mock-servers";
import { addKey } from "../src/lib/keys";
import { runGeneration, refreshTask } from "../src/lib/generation";

(async () => {
  const mocks = startMocks(4851, 4852);
  await addKey("kie", "stuck-key-0000", "stuck");
  let r = await runGeneration({ model: "gpt-image-2-6/flare-text-to-image", input: { prompt: "x" }, waitSeconds: 0 });
  assert.ok(r.kind === "task");
  if (r.kind !== "task") return;
  let t = (await refreshTask(r.task.id))!;
  assert.equal(t.status, "processing");
  assert.equal(t.error_message, "kie state: waiting");   // visible reason on the dashboard
  console.log("waiting state is visible:", t.error_message, "| progress", t.progress);

  const db = (await import("../src/lib/turso")).db;
  await db().execute("DELETE FROM api_keys");
  await addKey("kie", "err-key-000000", "err");
  r = await runGeneration({ model: "gpt-image-2-6/flare-text-to-image", input: { prompt: "y" }, waitSeconds: 0 });
  if (r.kind !== "task") return;
  t = (await refreshTask(r.task.id))!;
  assert.equal(t.status, "processing");
  assert.match(t.error_message ?? "", /Last check error: .*server busy/);
  console.log("check error is visible:", t.error_message);
  // a job the provider never finishes is failed after the timeout instead of hanging forever
  await db().execute("DELETE FROM api_keys");
  await addKey("kie", "stuck-key-0000", "stuck2");
  process.env.IMAGE_TIMEOUT_MIN = "-1";
  r = await runGeneration({ model: "gpt-image-2-6/flare-text-to-image", input: { prompt: "z" }, waitSeconds: 0 });
  if (r.kind !== "task") return;
  t = (await refreshTask(r.task.id))!;
  assert.equal(t.status, "failed");
  assert.match(t.error_message ?? "", /Timed out/);
  console.log("timeout OK:", t.error_message);
  mocks.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
