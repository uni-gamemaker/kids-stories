import type { ModelDef } from "../models";

export interface CheckResult {
  status: "processing" | "completed" | "failed";
  urls?: string[];
  error?: string;
  progress?: number;
}

export interface ProviderAdapter {
  // Asynchronous task (video, and images where supported). Returns the provider's task id.
  createTask(key: string, model: string, input: Record<string, unknown>): Promise<{ providerTaskId: string }>;
  // Synchronous image generation (CometAPI returns the result immediately).
  createImageSync?(key: string, model: string, input: Record<string, unknown>): Promise<{ urls: string[] }>;
  checkTask(key: string, providerTaskId: string, def: ModelDef): Promise<CheckResult>;
}

export async function fetchJson(url: string, init: RequestInit, timeoutMs = 60_000): Promise<{ status: number; body: any }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const text = await res.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}
