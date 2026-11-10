// Offline test of the data layer using a local libSQL file (CI/dev only).
import assert from "node:assert/strict";
process.env.TURSO_DATABASE_URL = "file:/tmp/kids-test.db";
import { ensureSchema, dbHealthy, insertTask, getTask, updateTask, listRecentTasks, taskStats } from "../src/lib/turso";

(async () => {
  await ensureSchema();
  assert.equal(await dbHealthy(), true);
  await insertTask({ id: "t1", model: "m", type: "image", prompt: "p", params: { a: 1 } });
  await insertTask({ id: "t2", model: "m", type: "video" });
  await updateTask("t1", { status: "processing", progress: 40, appendAttempt: { provider: "kie", keyId: "k", keyLabel: "", ok: true, at: "now" } });
  await updateTask("t1", { status: "completed", progress: 100, result_urls: ["https://x/y.png"] });
  const t = await getTask("t1");
  assert.ok(t && t.status === "completed" && t.completed_at && t.attempts.length === 1);
  assert.deepEqual(t.result_urls, ["https://x/y.png"]);
  assert.equal((await listRecentTasks(10, { type: "image" })).length, 1);
  const s = await taskStats();
  assert.deepEqual(s, { total: 2, completed: 1, failed: 0, running: 1 });
  console.log("turso layer: all assertions passed");
})();
