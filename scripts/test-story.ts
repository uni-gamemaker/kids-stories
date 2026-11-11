import assert from "node:assert/strict";
process.env.TURSO_DATABASE_URL = "file:/tmp/kids-story.db";
process.env.KIE_API_BASE = "http://localhost:4821";
process.env.MERGER_API_BASE = "http://localhost:4822";
import { startMocks } from "./mock-servers";
import { addKey } from "../src/lib/keys";
import { createStory, advanceStory, loadStory } from "../src/lib/story/engine";
import { HERO_LOOK } from "../src/lib/story/character";

(async () => {
  const mocks = startMocks(4821, 4822);
  await addKey("kie", "good-key-000000", "good");
  const bad = await createStory("nope");
  assert.equal(bad.ok, false);

  // order-form personalization
  const c = await createStory(1, { hero_name: "Omar", toy_name: "Bruno", worry: "the big chair" });
  assert.ok(c.ok); if (!c.ok) return;
  let s = (await loadStory(c.id))!;
  assert.equal(s.total, 11);
  assert.equal(s.title, "Omar's First Visit to the Dentist");
  assert.ok(s.pages.every((p) => !p.text.includes("{{") && !p.image_prompt.includes("{{")), "unfilled placeholders");
  assert.ok(s.pages[2].text.includes("the big chair") && s.pages[2].text.includes("Bruno"));
  // the image prompts keep the locked character sheet and never ask for text or photos
  assert.ok(s.pages.every((p) => p.image_prompt.includes(HERO_LOOK) && /no text/.test(p.image_prompt) && /not photorealistic/.test(p.image_prompt)));

  // default order = Adam
  const d = await createStory("first-dentist-visit");
  assert.ok(d.ok); if (!d.ok) return;
  assert.equal((await loadStory(d.id))!.title, "Adam's First Visit to the Dentist");

  // advance incrementally (max 4 in flight) until done
  let rounds = 0, maxInFlight = 0;
  while (rounds++ < 40) {
    const v = (await advanceStory(d.id))!;
    maxInFlight = Math.max(maxInFlight, v.pages.filter((p) => p.image_task_id && !p.image_url).length);
    if (v.status === "images_ready") { s = v; break; }
  }
  assert.equal(s.status, "images_ready");
  assert.equal(s.done, 11);
  assert.ok(maxInFlight <= 4, "in-flight cap respected: " + maxInFlight);
  console.log(`story OK: 11/11 images in ${rounds} rounds, max in flight ${maxInFlight}`);
  mocks.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
