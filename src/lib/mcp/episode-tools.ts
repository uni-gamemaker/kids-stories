import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { saveEpisode, listEpisodes, getEpisode, EPISODE_STATUSES } from "../episodes";

const out = (text: string, isError = false) => ({ content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) });
const line = (e: { id: string; title: string; status: string; summary: string; video_url: string | null; created_at: string }) =>
  `- [${e.status}] ${e.title} · episode_id: ${e.id} · ${e.created_at.slice(0, 10)}${e.summary ? `\n  summary: ${e.summary.slice(0, 160)}` : ""}${e.video_url ? `\n  video: ${e.video_url}` : ""}`;

export function registerEpisodeTools(server: McpServer) {
  server.registerTool("save_episode", {
    description: "Create or update an episode record (the persistent memory/queue of the short-video series). To QUEUE a story the author wrote: call with title + story_text (status planned). To record progress: pass episode_id with status (generating → merged → scheduled → published / failed), scenes, caption, merge_task_id, video_url. Always save each finished episode so future runs never repeat it.",
    inputSchema: {
      episode_id: z.string().optional().describe("Omit to create a new episode."),
      title: z.string().max(160).optional(),
      summary: z.string().max(600).optional().describe("2-3 sentence summary, used to avoid repeating stories."),
      story_text: z.string().max(20000).optional().describe("The author's own story or script."),
      scenes: z.array(z.object({}).passthrough()).max(12).optional().describe("Scene plan/results, e.g. [{prompt, dialogue, image_task_id, video_task_id}]."),
      caption: z.string().max(2200).optional(),
      status: z.enum(EPISODE_STATUSES).optional(),
      merge_task_id: z.string().optional(),
      video_url: z.string().optional(),
      notes: z.string().max(1000).optional(),
    },
  }, async (a) => {
    const r = await saveEpisode(a);
    return r.ok ? out(`✅ Episode saved\nepisode_id: ${r.episode.id}\ntitle: ${r.episode.title}\nstatus: ${r.episode.status}`) : out(`❌ ${r.error}`, true);
  });

  server.registerTool("list_episodes", {
    description: "List episodes from the database. status=planned returns the author's QUEUE in order (take the first one to make next). With no status it returns the most recent episodes of any status — read these before choosing a story so you never repeat one.",
    inputSchema: { status: z.enum(EPISODE_STATUSES).optional(), limit: z.number().int().min(1).max(100).default(20) },
  }, async ({ status, limit }) => {
    const eps = await listEpisodes({ status, limit });
    return out(eps.length ? `${eps.length} episode(s):\n${eps.map(line).join("\n")}` : status === "planned" ? "The queue is empty: no planned stories." : "No episodes yet.");
  });

  server.registerTool("get_episode", {
    description: "Full details of one episode, including the author's story_text and the scene plan.",
    inputSchema: { episode_id: z.string() },
  }, async ({ episode_id }) => {
    const e = await getEpisode(episode_id);
    return e ? out(JSON.stringify(e, null, 2)) : out(`❌ Episode not found: ${episode_id}`, true);
  });
}
