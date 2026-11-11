// Story engine: create an order, then advance image generation incrementally (serverless-friendly).
import { randomUUID } from "node:crypto";
import { db, ensureSchema } from "../turso";
import { runGeneration, refreshTask } from "../generation";
import { fill, DEFAULT_ORDER, type OrderForm } from "./types";
import { findTemplate } from "./templates";
import { HERO_LOOK, DENTIST_LOOK, STYLE } from "./character";

const IMAGE_MODEL = "gpt-image-2-6/flare-text-to-image";
const MAX_IN_FLIGHT = 4;      // do not hammer the provider with all pages at once
const MAX_ATTEMPTS_PER_PAGE = 3;

export interface StoryPage { page_no: number; text: string; image_prompt: string; image_task_id: string | null; image_url: string | null }
export interface StoryView {
  id: string; series_no: number; slug: string; title: string; status: string; hero_name: string;
  pdf_url: string | null; pages: StoryPage[]; done: number; total: number;
}

export function buildImagePrompt(scene: string, order: OrderForm): string {
  return [
    `Illustration for a children's picture book. ${STYLE}.`,
    `Main character (keep identical in every illustration): ${HERO_LOOK}.`,
    `Supporting character when present: ${DENTIST_LOOK}.`,
    `Scene: ${fill(scene, order)}`,
    "Landscape composition, 4:3.",
  ].join(" ");
}

export async function createStory(key: string | number, partial: Partial<OrderForm> = {}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const tpl = findTemplate(key);
  if (!tpl) return { ok: false, error: `Unknown story: ${key}` };
  await ensureSchema();
  const order: OrderForm = { ...DEFAULT_ORDER, ...Object.fromEntries(Object.entries(partial).filter(([, v]) => typeof v === "string" && v.trim())) } as OrderForm;
  const id = randomUUID();
  await db().batch([
    { sql: "INSERT INTO stories (id, series_no, slug, title, hero_name, order_json, status) VALUES (?,?,?,?,?,?,?)",
      args: [id, tpl.series_no, tpl.slug, fill(tpl.title, order), order.hero_name, JSON.stringify(order), "generating"] },
    ...tpl.pages.map((p, i) => ({
      sql: "INSERT INTO story_pages (story_id, page_no, text, image_prompt) VALUES (?,?,?,?)",
      args: [id, i, fill(p.text, order), buildImagePrompt(p.scene, order)],
    })),
  ], "write");
  return { ok: true, id };
}

export async function loadStory(id: string): Promise<StoryView | null> {
  await ensureSchema();
  const s = await db().execute({ sql: "SELECT * FROM stories WHERE id = ?", args: [id] });
  if (!s.rows[0]) return null;
  const r = s.rows[0] as any;
  const p = await db().execute({ sql: "SELECT * FROM story_pages WHERE story_id = ? ORDER BY page_no", args: [id] });
  const pages = p.rows.map((x: any) => ({ page_no: Number(x.page_no), text: String(x.text), image_prompt: String(x.image_prompt), image_task_id: x.image_task_id ?? null, image_url: x.image_url ?? null }));
  return { id, series_no: Number(r.series_no), slug: String(r.slug), title: String(r.title), status: String(r.status), hero_name: String(r.hero_name), pdf_url: r.pdf_url ?? null, pages, done: pages.filter((x) => x.image_url).length, total: pages.length };
}

async function attempts(storyId: string, pageNo: number): Promise<number> {
  const r = await db().execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE story_id = ? AND page_no = ?", args: [storyId, pageNo] });
  return Number((r.rows[0] as any).n);
}

// One incremental step: collect finished images, retry failed pages, start new ones. Call repeatedly.
export async function advanceStory(id: string): Promise<StoryView | null> {
  let s = await loadStory(id);
  if (!s) return null;
  if (s.status === "ready" || s.status === "failed") return s;

  for (const pg of s.pages) {
    if (pg.image_url || !pg.image_task_id) continue;
    const t = await refreshTask(pg.image_task_id);
    if (t?.status === "completed" && t.result_urls[0]) {
      await db().execute({ sql: "UPDATE story_pages SET image_url = ? WHERE story_id = ? AND page_no = ?", args: [t.result_urls[0], id, pg.page_no] });
    } else if (t?.status === "failed") {
      await db().execute({ sql: "UPDATE story_pages SET image_task_id = NULL WHERE story_id = ? AND page_no = ?", args: [id, pg.page_no] });
    }
  }
  s = (await loadStory(id))!;

  let inFlight = s.pages.filter((p) => !p.image_url && p.image_task_id).length;
  for (const pg of s.pages) {
    if (inFlight >= MAX_IN_FLIGHT) break;
    if (pg.image_url || pg.image_task_id) continue;
    if ((await attempts(id, pg.page_no)) >= MAX_ATTEMPTS_PER_PAGE) {
      await db().execute({ sql: "UPDATE stories SET status='failed', updated_at=datetime('now') WHERE id = ?", args: [id] });
      return loadStory(id);
    }
    const r = await runGeneration({ model: IMAGE_MODEL, input: { prompt: pg.image_prompt, aspect_ratio: "4:3", resolution: "1K", output_format: "png" }, waitSeconds: 0, story_id: id, page_no: pg.page_no });
    if (r.kind === "error") return { ...(await loadStory(id))!, status: "failed" };
    await db().execute({ sql: "UPDATE story_pages SET image_task_id = ? WHERE story_id = ? AND page_no = ?", args: [r.task.id, id, pg.page_no] });
    if (r.task.status === "completed" && r.task.result_urls[0]) {
      await db().execute({ sql: "UPDATE story_pages SET image_url = ? WHERE story_id = ? AND page_no = ?", args: [r.task.result_urls[0], id, pg.page_no] });
    } else inFlight++;
  }
  s = (await loadStory(id))!;
  if (s.done === s.total && s.status === "generating") {
    await db().execute({ sql: "UPDATE stories SET status='images_ready', updated_at=datetime('now') WHERE id = ?", args: [id] });
    s = (await loadStory(id))!;
  }
  return s;
}
