import assert from "node:assert/strict";
process.env.TURSO_DATABASE_URL = "file:/tmp/kids-keys.db";
import { classifyProviderError as c, maskKey, addKey, getKeyPool, setKeyStatus, listKeys, publicKey } from "../src/lib/keys";
import { resolveModel } from "../src/lib/models";

(async () => {
  // classification table
  assert.equal(c(401, "x"), "disabled");
  assert.equal(c(200, "Invalid API key"), "disabled");
  assert.equal(c(402, "x"), "exhausted");
  assert.equal(c(400, "Insufficient credits"), "exhausted"); // balance checked before 400
  assert.equal(c(400, "Model not found"), "provider");
  assert.equal(c(422, "bad aspect_ratio"), "params");
  assert.equal(c(429, "slow"), "temporary");
  assert.equal(c(503, "down"), "temporary");
  // masking
  assert.equal(maskKey("k1234567890abcdefghij0000wxyz"), "k123456••••••••wxyz");
  assert.equal(maskKey("short"), "sho••••");
  // strict insertion order incl. same-second inserts, duplicate rejection, disabled excluded
  const ids: string[] = [];
  for (const k of ["k1-aaaaaaaaaaaa", "k2-bbbbbbbbbbbb", "k3-cccccccccccc"]) {
    const r = await addKey("kie", k, k); assert.ok(r.ok); if (r.ok) ids.push(r.id);
  }
  assert.equal((await addKey("kie", "k1-aaaaaaaaaaaa")).ok, false);
  assert.deepEqual((await getKeyPool(["kie", "cometapi"])).map((x) => x.label), ["k1-aaaaaaaaaaaa", "k2-bbbbbbbbbbbb", "k3-cccccccccccc"]);
  await setKeyStatus(ids[0], "exhausted", "no balance");
  assert.equal((await getKeyPool(["kie"]))[0].label, "k1-aaaaaaaaaaaa"); // exhausted stays in pool
  await setKeyStatus(ids[1], "disabled");
  assert.deepEqual((await getKeyPool(["kie"])).map((x) => x.label), ["k1-aaaaaaaaaaaa", "k3-cccccccccccc"]);
  assert.ok(!("api_key" in publicKey((await listKeys())[0])));
  // aliases
  assert.equal(resolveModel("grok-imagine-video-1.5-preview")?.canonical, "grok-imagine-video-1-5-preview");
  assert.equal(resolveModel("nope"), null);
  console.log("keys + models: all assertions passed");
})();
