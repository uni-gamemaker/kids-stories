import type { TaskRow } from "./turso";
import { clientSafeError } from "./generation";

export interface ToolText { text: string; isError?: boolean }

export function formatTask(t: TaskRow): ToolText {
  if (t.status === "completed") {
    const urls = t.result_urls;
    if (t.type === "image") {
      return { text: `✅ Image generated successfully\n\n${urls.map((u) => `![image](${u})`).join("\n")}\n\nDirect link: ${urls.join("\n")}\ntask_id: ${t.id}` };
    }
    if (t.type === "merge") {
      return { text: `✅ Clips merged successfully\n\nDirect link: ${urls.join("\n")}\ntask_id: ${t.id}\n\n⚠️ The merged file is deleted from the merging service after ~24 hours — watch/download it promptly.` };
    }
    return { text: `✅ Video generated successfully\n\nDirect link: ${urls.join("\n")}\ntask_id: ${t.id}` };
  }
  if (t.status === "failed") return { text: `❌ The task failed: ${clientSafeError(t.error_message)}\ntask_id: ${t.id}`, isError: true };
  return { text: `⏳ The task is being processed — task_id: ${t.id}\nProgress: ${t.progress}%\nFollow up with get_task every ~10 seconds until it completes.` };
}
