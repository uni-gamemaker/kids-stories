// kie.ai unified Jobs API. Shapes follow the spec; verify against docs.kie.ai with a real call.
import { ProviderError } from "../keys";
import { fetchJson, type ProviderAdapter } from "./types";

const BASE = () => (process.env.KIE_API_BASE || "https://api.kie.ai") + "/api/v1/jobs"; // env override is for offline tests

function fail(status: number, body: any): never {
  // kie.ai may return HTTP 200 with a non-200 "code" in the body.
  const code = Number(body?.code ?? status);
  throw new ProviderError(status === 200 ? code : status, String(body?.msg ?? body?.message ?? body?.raw ?? `HTTP ${status}`));
}

export const kie: ProviderAdapter = {
  async createTask(key, model, input) {
    const { status, body } = await fetchJson(`${BASE()}/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }),
    });
    if (status !== 200 || Number(body?.code) !== 200 || !body?.data?.taskId) fail(status, body);
    return { providerTaskId: String(body.data.taskId) };
  },

  async checkTask(key, id) {
    const { status, body } = await fetchJson(`${BASE()}/recordInfo?taskId=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (status !== 200 || Number(body?.code) !== 200) fail(status, body);
    const d = body.data ?? {};
    const state = String(d.state ?? "").toLowerCase();
    if (state === "success") {
      let urls: string[] = [];
      try { urls = JSON.parse(d.resultJson || "{}").resultUrls ?? []; } catch { /* second parse failed */ }
      return urls.length ? { status: "completed", urls, progress: 100 } : { status: "failed", error: "Finished without a result URL." };
    }
    if (state === "fail") return { status: "failed", error: String(d.failMsg || "Generation failed.") };
    const progress = state === "generating" ? 50 : state === "queuing" ? 15 : 5;
    return { status: "processing", progress };
  },
};
