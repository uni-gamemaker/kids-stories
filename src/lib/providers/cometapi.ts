// CometAPI (api.cometapi.com, Bearer auth, OpenAI-compatible).
// UNTESTED: image uses the OpenAI-compatible images endpoint; video path is configurable
// via COMETAPI_VIDEO_PATH because the exact route was not available when this was written.
import { ProviderError } from "../keys";
import { fetchJson, type ProviderAdapter } from "./types";

const BASE_URL = () => process.env.COMETAPI_BASE || "https://api.cometapi.com";
const VIDEO_PATH = () => process.env.COMETAPI_VIDEO_PATH || "/v1/video/generations";

const auth = (k: string) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" });
const errOf = (status: number, b: any) => new ProviderError(status, String(b?.error?.message ?? b?.message ?? b?.raw ?? `HTTP ${status}`));

export const cometapi: ProviderAdapter = {
  async createImageSync(key, model, input) {
    const { status, body } = await fetchJson(`${BASE_URL()}/v1/images/generations`, {
      method: "POST",
      headers: auth(key),
      body: JSON.stringify({ model, prompt: input.prompt, n: 1, ...(input.size ? { size: input.size } : {}) }),
    }, 120_000);
    if (status !== 200) throw errOf(status, body);
    const urls = (body?.data ?? []).map((d: any) => d.url).filter(Boolean) as string[];
    // We never download media; a base64-only reply cannot be stored as a link.
    if (!urls.length) throw new ProviderError(502, "CometAPI returned no image URL.");
    return { urls };
  },

  async createTask(key, model, input) {
    const { status, body } = await fetchJson(`${BASE_URL()}${VIDEO_PATH()}`, {
      method: "POST",
      headers: auth(key),
      body: JSON.stringify({ model, ...input }),
    });
    const id = body?.task_id ?? body?.id ?? body?.data?.task_id ?? body?.data?.id;
    if (status >= 300 || !id) throw errOf(status, body);
    return { providerTaskId: String(id) };
  },

  async checkTask(key, id) {
    const { status, body } = await fetchJson(`${BASE_URL()}${VIDEO_PATH()}/${encodeURIComponent(id)}`, { headers: auth(key) });
    if (status >= 300) throw errOf(status, body);
    const d = body?.data ?? body;
    const s = String(d?.status ?? d?.state ?? "").toLowerCase();
    if (/succe|complete|done/.test(s)) {
      const url = d?.video_url ?? d?.url ?? d?.output?.url ?? d?.data?.[0]?.url;
      return url ? { status: "completed", urls: [url], progress: 100 } : { status: "failed", error: "Finished without a result URL." };
    }
    if (/fail|error|cancel/.test(s)) return { status: "failed", error: String(d?.error?.message ?? d?.fail_reason ?? d?.error ?? "Generation failed.") };
    return { status: "processing", progress: Number(d?.progress) || 10 };
  },
};
