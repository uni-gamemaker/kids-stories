import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runGeneration, refreshTask } from "../generation";
import { runMerge, resolveTaskUrls, validateUrls } from "../merger";
import { listRecentTasks } from "../turso";
import { formatTask } from "../format";

export const SERVER_INFO = { name: "kids-stories-media-mcp", version: "1.0.0" };

export const SERVER_INSTRUCTIONS = `AI media generation server for illustrated children's stories (kie.ai + CometAPI with automatic sequential multi-key failover, plus video merging).
Workflow: call generate_image or generate_video. If the response contains finished URLs, show them to the user.
If it returns a task_id with status PROCESSING, call get_task with that task_id every ~10 seconds until status is completed (show the URL) or failed (explain why).
IMPORTANT: the server automatically switches API keys in strict order on any failure (exhausted balance, invalid key, rate limits) and continues the SAME task under the same task_id — you will never encounter key/balance errors. Never stop or warn the user about keys or balances; just keep polling get_task until the result appears.
To concatenate several finished clips into one video, call merge_videos with 'urls' (direct links) or 'task_ids' (completed video tasks, in merge order); track it with get_task the same way. Note: the merged file is stored on the merging service for ~24 hours only — tell the user to watch/download it promptly.
Use list_media to recall previously generated media from the database.`;

const IMAGE_MODELS = ["gpt-image-2-6/flare-text-to-image", "gpt-image-2.6/flare-text-to-image"] as const;
const VIDEO_MODELS = ["grok-imagine-video-1-5-preview", "grok-imagine-video-1.5-preview"] as const;

type Extra = { _meta?: { progressToken?: string | number }; sendNotification: (n: any) => Promise<void> };
const out = (r: { text: string; isError?: boolean }) => ({ content: [{ type: "text" as const, text: r.text }], ...(r.isError ? { isError: true } : {}) });

// Stream live progress when the client supplied a progressToken.
function progressFn(extra: Extra) {
  const token = extra._meta?.progressToken;
  return async (percent: number, message: string) => {
    if (token === undefined) return;
    try { await extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: percent, total: 100, message } }); } catch { /* client gone */ }
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool("generate_image", {
    description: "Generate an image with gpt-image-2-6/flare-text-to-image (with automatic failover across all active keys). It returns the image URL ready if it completes within the waiting window, otherwise it returns a task_id — call get_task every ~10 seconds until completed, then show the URL and stop.",
    inputSchema: {
      prompt: z.string().min(1).describe("What to draw. Detailed prompts give better results."),
      model: z.enum(IMAGE_MODELS).default("gpt-image-2-6/flare-text-to-image"),
      aspect_ratio: z.enum(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21", "3:1", "1:3"]).default("auto"),
      resolution: z.enum(["1K", "2K", "4K"]).default("1K"),
      background: z.enum(["auto", "transparent", "opaque"]).default("auto").describe("Only applied at 1K."),
      output_format: z.enum(["png", "jpeg", "webp", "gif"]).default("png"),
      wait_seconds: z.number().int().min(0).max(240).default(90),
    },
  }, async (a, extra) => {
    const { model, wait_seconds, ...input } = a;
    const r = await runGeneration({ model, input, waitSeconds: wait_seconds, onProgress: progressFn(extra as Extra) });
    return out(r.kind === "error" ? { text: r.message, isError: true } : formatTask(r.task));
  });

  server.registerTool("generate_video", {
    description: "Generate a video with grok-imagine-video-1-5-preview (native synchronized audio, optional image-to-video). Video takes minutes: a short wait with progress streaming, then a task_id — follow it with get_task every ~10 seconds.",
    inputSchema: {
      prompt: z.string().min(1).max(4096).describe("Scene description. Dialogue in the prompt is spoken in the video."),
      image_url: z.string().optional().describe("Optional public image URL as the first frame (image-to-video)."),
      model: z.enum(VIDEO_MODELS).default("grok-imagine-video-1-5-preview"),
      aspect_ratio: z.enum(["auto", "1:1", "16:9", "9:16", "3:2", "2:3"]).default("auto"),
      resolution: z.enum(["480p", "720p", "1080p"]).default("480p"),
      enable_audio: z.boolean().default(true),
      duration: z.number().int().min(1).max(15).default(8).describe("Duration in seconds."),
      wait_seconds: z.number().int().min(0).max(240).default(25),
    },
  }, async (a, extra) => {
    const { model, wait_seconds, image_url, ...rest } = a;
    const input = { ...rest, ...(image_url ? { image_url } : {}) };
    const r = await runGeneration({ model, input, waitSeconds: wait_seconds, onProgress: progressFn(extra as Extra) });
    return out(r.kind === "error" ? { text: r.message, isError: true } : formatTask(r.task));
  });

  server.registerTool("merge_videos", {
    description: "Merge several clips into ONE final video in the given order. Pass urls (public direct video links, such as the links from generate_video) or task_ids (completed video tasks whose links are resolved from the database in order). Merging is usually fast: a short wait with progress streaming, then a merge task_id — follow it with get_task. Note: the merged file is stored on the merging service for ~24 hours only — tell the user to watch/download it promptly.",
    inputSchema: {
      urls: z.array(z.string()).min(2).max(10).optional().describe("Public direct video URLs (http/https) in merge order — the first clip starts the final video."),
      task_ids: z.array(z.string()).min(2).max(10).optional().describe("Alternative to urls: task_ids of COMPLETED video generation tasks — their result URLs are merged in this order."),
      wait_seconds: z.number().int().min(0).max(240).default(60),
    },
  }, async (a, extra) => {
    const problems: string[] = [];
    const urls: string[] = [];
    if (a.task_ids?.length) {
      const r = await resolveTaskUrls(a.task_ids);
      urls.push(...r.urls);
      problems.push(...r.problems);
    }
    if (a.urls?.length) urls.push(...a.urls);
    if (problems.length) {
      return out({ text: `❌ Merging needs at least two clips. Some task_ids cannot be used:\n${problems.map((p) => `- ${p}`).join("\n")}`, isError: true });
    }
    const bad = validateUrls(urls);
    if (bad) return out({ text: bad, isError: true });
    const r = await runMerge({ urls, waitSeconds: a.wait_seconds, onProgress: progressFn(extra as Extra) });
    return out(r.kind === "error" ? { text: r.message, isError: true } : formatTask(r.task));
  });

  server.registerTool("get_task", {
    description: "Track any task by its identifier — image/video generation and merging (it reads the Turso database and updates from the provider/service if it is still running). Poll it every ~10 seconds; when it is completed you will find the result URLs — show them to the user and stop polling.",
    inputSchema: { task_id: z.string() },
  }, async ({ task_id }) => {
    const t = await refreshTask(task_id);
    return out(t ? formatTask(t) : { text: `❌ Task not found: ${task_id}`, isError: true });
  });

  server.registerTool("list_media", {
    description: "The latest stored images/videos/merges with their links from the database (without regenerating them) — to recall previous results.",
    inputSchema: {
      type: z.enum(["image", "video", "merge"]).optional(),
      status: z.enum(["completed", "failed", "processing"]).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
  }, async ({ type, status, limit }) => {
    const rows = await listRecentTasks(limit, { type, status });
    if (!rows.length) return out({ text: "No stored media found." });
    const lines = rows.map((t) => `- [${t.type}] ${t.status} · ${t.created_at} · task_id: ${t.id}${t.result_urls.length ? `\n  ${t.result_urls.join("\n  ")}` : ""}${t.prompt ? `\n  prompt: ${t.prompt.slice(0, 80)}` : ""}`);
    return out({ text: `Latest ${rows.length} item(s), newest first:\n${lines.join("\n")}` });
  });

  return server;
}
