import assert from "node:assert/strict";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildStoryPdf } from "../src/lib/story/pdf";
import { TEMPLATES } from "../src/lib/story/templates";
import { fill, DEFAULT_ORDER } from "../src/lib/story/types";

(async () => {
  const order = { ...DEFAULT_ORDER, hero_name: "Ömer 小明" }; // non-Latin must not crash
  const t = TEMPLATES[0];
  const story: any = { id: "x", title: fill(t.title, order), done: 11, total: 11, status: "images_ready",
    pages: t.pages.map((p, i) => ({ page_no: i, text: fill(p.text, order), image_prompt: "", image_task_id: "t", image_url: "https://x/p.png" })) };
  const png = new Uint8Array(fs.readFileSync("/tmp/page.png"));
  const bytes = await buildStoryPdf(story, async () => png);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), "%PDF");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 11);
  fs.writeFileSync("/tmp/story-sample.pdf", bytes);
  await assert.rejects(buildStoryPdf({ ...story, pages: [{ ...story.pages[0], image_url: null }] }, async () => png), /not all/i);
  console.log(`pdf OK: ${doc.getPageCount()} pages, ${(bytes.length / 1024).toFixed(0)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
