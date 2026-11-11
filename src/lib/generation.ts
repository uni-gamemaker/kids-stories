// Generation coordinator: silent sequential failover, "never stop" semantics.
import { randomUUID } from "node:crypto";
import { resolveModel, type ModelDef } from "./models";
import { adapters } from "./providers";
import { getKeyPool, getKeyById, classifyError, setKeyStatus, recordKeyUse, KEY_FAILURE_PATTERN, type ApiKeyRow } from "./keys";
import { insertTask, getTask, updateTask, type TaskRow } from "./turso";
import { refreshMergeTask } from "./merger";

export type Progress = (percent: number, message: string) => Promise<void> | void;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const COOLDOWN_MS = 45_000; // wait between automatic retries when every key failed
const WAITING_MSG = "Waiting for a valid key to become available…"; // internal only

export function dbTime(s: string): number {
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").getTime();
}

// The AI client must never see key/balance problems.
export function clientSafeError(msg: string | null): string {
  if (!msg || KEY_FAILURE_PATTERN.test(msg) || /api key|authentication/i.test(msg)) return "A temporary provider problem occurred; the task is being retried.";
  return msg;
}

type CreateResult = "created" | "completed" | "failed" | "waiting";

// Try candidate keys in the given order until one accepts the task.
async function createOnPool(task: TaskRow, def: ModelDef, candidates: ApiKeyRow[]): Promise<CreateResult> {
  for (const key of candidates) {
    const adapter = adapters[key.provider];
    const model = def.providerModel[key.provider];
    const base = { provider: key.provider, keyId: key.id, keyLabel: key.label };
    try {
      if (def.type === "image" && adapter.createImageSync) {
        const { urls } = await adapter.createImageSync(key.api_key, model, task.params);
        await recordKeyUse(key.id, true);
        if (key.status === "exhausted") await setKeyStatus(key.id, "active");
        await updateTask(task.id, {
          provider: key.provider, key_id: key.id, provider_task_id: null, status: "completed", progress: 100,
          result_urls: urls, error_message: null, appendAttempt: { ...base, ok: true, at: new Date().toISOString() },
        });
        return "completed";
      }
      const { providerTaskId } = await adapter.createTask(key.api_key, model, task.params);
      await recordKeyUse(key.id, true);
      if (key.status === "exhausted") await setKeyStatus(key.id, "active");
      await updateTask(task.id, {
        provider: key.provider, key_id: key.id, provider_task_id: providerTaskId, status: "processing", progress: 5,
        error_message: null, appendAttempt: { ...base, ok: true, at: new Date().toISOString() },
      });
      return "created";
    } catch (e) {
      const { cls, message } = classifyError(e);
      await recordKeyUse(key.id, false, message);
      if (cls === "disabled") await setKeyStatus(key.id, "disabled", message);
      if (cls === "exhausted") await setKeyStatus(key.id, "exhausted", message);
      await updateTask(task.id, { appendAttempt: { ...base, ok: false, errorClass: cls, error: message.slice(0, 300), at: new Date().toISOString() } });
      if (cls === "params") {
        // Switching keys cannot fix bad parameters: stop immediately.
        await updateTask(task.id, { status: "failed", error_message: message });
        return "failed";
      }
    }
  }
  // Every key failed: stay "processing" and retry on later get_task calls.
  await updateTask(task.id, { status: "processing", provider_task_id: null, error_message: WAITING_MSG });
  return "waiting";
}

// Continue the SAME task on the keys after the current one (mid-task failover).
async function failover(t: TaskRow, def: ModelDef, currentKeyId: string | null): Promise<void> {
  const pool = await getKeyPool(def.providers);
  const idx = currentKeyId ? pool.findIndex((k) => k.id === currentKeyId) : -1;
  const candidates = idx >= 0 ? pool.slice(idx + 1) : pool;
  if (!candidates.length) {
    await updateTask(t.id, { status: "processing", provider_task_id: null, error_message: WAITING_MSG });
    return;
  }
  await createOnPool(t, def, candidates);
}

export async function refreshTask(id: string): Promise<TaskRow | null> {
  const t = await getTask(id);
  if (!t) return null;
  if (t.status === "completed" || t.status === "failed") return t;
  if (t.type === "merge") return refreshMergeTask(t);

  const def = resolveModel(t.model);
  if (!def) {
    await updateTask(id, { status: "failed", error_message: "Unknown model." });
    return getTask(id);
  }

  // Waiting for a key: retry from the start of the pool after the cooldown.
  if (!t.provider_task_id) {
    if (Date.now() - dbTime(t.updated_at) < COOLDOWN_MS) return t;
    const pool = await getKeyPool(def.providers);
    if (!pool.length) { await updateTask(id, { error_message: WAITING_MSG }); return getTask(id); }
    await createOnPool(t, def, pool);
    return getTask(id);
  }

  const key = t.key_id ? await getKeyById(t.key_id) : null;
  if (!key || key.status === "disabled") {
    await failover(t, def, t.key_id);
    return getTask(id);
  }

  try {
    const r = await adapters[key.provider].checkTask(key.api_key, t.provider_task_id, def);
    if (r.status === "completed") {
      await updateTask(id, { status: "completed", progress: 100, result_urls: r.urls ?? [], error_message: null });
    } else if (r.status === "failed") {
      if (KEY_FAILURE_PATTERN.test(r.error ?? "")) {
        await setKeyStatus(key.id, /unauthorized|401/i.test(r.error ?? "") ? "disabled" : "exhausted", r.error);
        await failover(t, def, key.id);
      } else {
        await updateTask(id, { status: "failed", error_message: r.error ?? "Generation failed." });
      }
    } else {
      await updateTask(id, { progress: Math.max(t.progress, r.progress ?? t.progress) });
    }
  } catch (e) {
    const { cls, message } = classifyError(e);
    if (cls === "disabled" || cls === "exhausted") {
      await setKeyStatus(key.id, cls, message);
      await failover(t, def, key.id);
    }
    // temporary errors: keep the task as is and try again on the next poll
  }
  return getTask(id);
}

export interface RunArgs {
  model: string;
  input: Record<string, unknown>;
  waitSeconds: number;
  onProgress?: Progress;
  story_id?: string;
  page_no?: number;
}
export type RunResult = { kind: "error"; message: string } | { kind: "task"; task: TaskRow };

export async function runGeneration(a: RunArgs): Promise<RunResult> {
  const def = resolveModel(a.model);
  if (!def) return { kind: "error", message: `❌ Unknown model: ${a.model}` };
  const pool = await getKeyPool(def.providers);
  if (!pool.length) {
    return { kind: "error", message: `❌ There are no active keys for the service \`${def.canonical}\`. Add at least one key from the admin dashboard, then try again.` };
  }
  const id = randomUUID();
  // Register BEFORE any outbound call so the task stays traceable.
  await insertTask({ id, model: def.canonical, type: def.type, prompt: String(a.input.prompt ?? ""), params: a.input, story_id: a.story_id, page_no: a.page_no });
  const task = (await getTask(id))!;
  const res = await createOnPool(task, def, pool);
  if (res === "completed" || res === "failed") return { kind: "task", task: (await getTask(id))! };

  const deadline = Date.now() + a.waitSeconds * 1000;
  let cur = (await getTask(id))!;
  while (cur.status === "processing" && Date.now() < deadline) {
    await sleep(3000);
    cur = (await refreshTask(id)) ?? cur;
    await a.onProgress?.(cur.progress, `Generating… ${cur.progress}%`);
  }
  return { kind: "task", task: cur };
}
