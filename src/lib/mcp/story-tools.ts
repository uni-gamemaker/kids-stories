import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TEMPLATES } from "../story/templates";
import { createStory, advanceStory } from "../story/engine";

const out = (text: string, isError = false) => ({ content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) });

export function registerStoryTools(server: McpServer) {
  server.registerTool("list_story_templates", {
    description: "List the available stories in the series, in order (series number, slug, title).",
    inputSchema: {},
  }, async () => out(TEMPLATES.map((t) => `${t.series_no}. ${t.slug} — ${t.title.replace("{{hero_name}}", "Adam")} (${t.pages.length} pages incl. cover)`).join("\n")));

  server.registerTool("create_story", {
    description: "Start a personalized illustrated story (hero Adam is a fully fictional cartoon boy; no photos). Returns a story_id; then call get_story every ~10 seconds until the pages are ready.",
    inputSchema: {
      story: z.string().default("first-dentist-visit").describe("Story slug or series number. Story 1 = first-dentist-visit."),
      hero_name: z.string().max(40).optional().describe("Child's name from the order form. Default: Adam."),
      place: z.string().max(80).optional().describe("Real place, e.g. the clinic name."),
      toy: z.string().max(120).optional().describe("Short visual description of the favourite toy."),
      toy_name: z.string().max(40).optional(),
      worry: z.string().max(80).optional().describe("The child's specific worry as a short noun phrase."),
    },
  }, async ({ story, ...order }) => {
    const r = await createStory(story, order);
    if (!r.ok) return out(`❌ ${r.error}`, true);
    const s = await advanceStory(r.id);
    return out(`⏳ Story started — story_id: ${r.id}\nImages: ${s?.done ?? 0}/${s?.total ?? 0}\nCall get_story every ~10 seconds until it is ready.`);
  });

  server.registerTool("get_story", {
    description: "Advance and report a story's illustration progress. Poll every ~10 seconds. When all images are ready it lists every page with its text and image link.",
    inputSchema: { story_id: z.string() },
  }, async ({ story_id }) => {
    const s = await advanceStory(story_id);
    if (!s) return out(`❌ Story not found: ${story_id}`, true);
    if (s.status === "failed") return out(`❌ The story could not be completed (an illustration failed repeatedly). story_id: ${story_id}`, true);
    if (s.status === "generating") return out(`⏳ Illustrating "${s.title}" — ${s.done}/${s.total} images ready. Poll get_story again in ~10 seconds.`);
    const lines = s.pages.map((p) => `Page ${p.page_no}${p.page_no === 0 ? " (cover)" : ""}: ${p.text}\n${p.image_url}`);
    return out(`✅ "${s.title}" — all ${s.total} images ready${s.pdf_url ? `\nPDF: ${s.pdf_url}` : ""}\n\n${lines.join("\n\n")}`);
  });
}
