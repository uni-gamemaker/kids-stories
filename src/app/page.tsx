"use client";
import { useCallback, useEffect, useState } from "react";

type Key = { id: string; provider: string; label: string; api_key_masked: string; status: string; usage_count: number; success_count: number; fail_count: number; last_used_at: string | null; last_error: string | null };
type Task = { id: string; type: string; status: string; progress: number; model: string; prompt: string; urls: string[]; error: string | null; note?: string | null; provider_task_id?: string | null; attempts: number; created_at: string };
type Story = { id: string; title: string; status: string; done?: number; total?: number; pdf_url?: string | null };

const badge: Record<string, string> = { active: "bg-emerald-100 text-emerald-800", exhausted: "bg-amber-100 text-amber-800", disabled: "bg-slate-200 text-slate-700", completed: "bg-emerald-100 text-emerald-800", failed: "bg-rose-100 text-rose-800", processing: "bg-sky-100 text-sky-800", pending: "bg-sky-100 text-sky-800", generating: "bg-sky-100 text-sky-800", images_ready: "bg-violet-100 text-violet-800", ready: "bg-emerald-100 text-emerald-800" };
const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[s] ?? "bg-slate-100"}`}>{s}</span>;
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="mb-3 text-lg font-semibold">{title}</h2>{children}</section>
);

export default function Dashboard() {
  const [token, setToken] = useState("");
  const [keys, setKeys] = useState<Key[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, running: 0 });
  const [health, setHealth] = useState<any>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ provider: "kie", api_key: "", label: "" });
  const [order, setOrder] = useState({ hero_name: "Adam", place: "", toy_name: "", worry: "" });
  const [mcpUrl, setMcpUrl] = useState("/mcp");

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { "x-admin-token": token } : {}), ...(init.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }, [token]);

  const load = useCallback(async () => {
    try {
      const [k, t, s, h] = await Promise.all([api("/api/keys"), api("/api/tasks"), api("/api/stories"), fetch("/api/health").then((r) => r.json())]);
      setKeys(k.keys); setTasks(t.tasks); setStats(t.stats); setStories(s.stories); setHealth(h); setMsg("");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
  }, [api]);

  useEffect(() => { setToken(sessionStorage.getItem("admin") ?? ""); setMcpUrl(`${location.origin}/mcp`); }, []);
  useEffect(() => { load(); const i = setInterval(load, 6000); return () => clearInterval(i); }, [load]);

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } };

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Kids Stories Studio</h1><p className="text-slate-600">Illustrated stories for kids, powered by an MCP media server.</p></div>
        <input className="w-56 rounded-lg border px-3 py-1.5 text-sm" type="password" placeholder="Admin token (if set)" value={token} onChange={(e) => { setToken(e.target.value); sessionStorage.setItem("admin", e.target.value); }} />
      </header>
      {msg && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{msg}</p>}

      <Card title="Connection">
        <p className="text-sm">MCP endpoint: <code className="rounded bg-slate-100 px-2 py-0.5">{mcpUrl}</code></p>
        <p className="mt-1 text-sm text-slate-600">Database: {health?.database ?? "…"} · Merger: {health?.merger?.healthy ? "reachable" : "not reachable / not configured"}{health?.mcpAuth === "secret-url" ? " · MCP protected by secret URL (/mcp/<secret>)" : health?.mcpAuth === "bearer" ? " · MCP bearer token required" : " · ⚠ MCP is OPEN: set MCP_URL_SECRET or MCP_ACCESS_TOKEN"}</p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="API keys (tried in the order added)">
          <div className="mb-3 grid grid-cols-[110px_1fr_110px_auto] gap-2">
            <select className="rounded-lg border px-2" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}><option value="kie">kie.ai</option><option value="cometapi">CometAPI</option></select>
            <input className="rounded-lg border px-3 py-1.5" type="password" placeholder="API key" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            <input className="rounded-lg border px-3" placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <button className="rounded-lg bg-slate-900 px-4 text-white" onClick={() => act(async () => { await api("/api/keys", { method: "POST", body: JSON.stringify(form) }); setForm({ ...form, api_key: "", label: "" }); })}>Add</button>
          </div>
          <ul className="divide-y text-sm">
            {keys.map((k, i) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-5 text-slate-400">{i + 1}</span><span className="font-medium">{k.provider}</span><code className="text-xs">{k.api_key_masked}</code>{k.label && <span className="text-slate-500">{k.label}</span>}<Pill s={k.status} />
                <span className="text-xs text-slate-500">{k.success_count} ok / {k.fail_count} failed</span>
                <span className="ml-auto flex gap-1">
                  <button className="rounded border px-2 py-0.5" onClick={() => act(() => api(`/api/keys/${k.id}`, { method: "PATCH", body: JSON.stringify({ status: k.status === "disabled" ? "active" : "disabled" }) }))}>{k.status === "disabled" ? "Enable" : "Disable"}</button>
                  <button className="rounded border px-2 py-0.5 text-rose-700" onClick={() => confirm("Delete this key?") && act(() => api(`/api/keys/${k.id}`, { method: "DELETE" }))}>Delete</button>
                </span>
                {k.last_error && <p className="w-full truncate text-xs text-amber-700">Last error: {k.last_error}</p>}
              </li>
            ))}
            {!keys.length && <li className="py-3 text-slate-500">No keys yet. Add one above.</li>}
          </ul>
        </Card>

        <Card title="New story">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input className="rounded-lg border px-3 py-1.5" placeholder="Hero name (default Adam)" value={order.hero_name} onChange={(e) => setOrder({ ...order, hero_name: e.target.value })} />
            <input className="rounded-lg border px-3 py-1.5" placeholder="Clinic name" value={order.place} onChange={(e) => setOrder({ ...order, place: e.target.value })} />
            <input className="rounded-lg border px-3 py-1.5" placeholder="Toy's name" value={order.toy_name} onChange={(e) => setOrder({ ...order, toy_name: e.target.value })} />
            <input className="rounded-lg border px-3 py-1.5" placeholder="Worry (e.g. the buzzing sounds)" value={order.worry} onChange={(e) => setOrder({ ...order, worry: e.target.value })} />
          </div>
          <button className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={() => act(() => api("/api/stories", { method: "POST", body: JSON.stringify({ story: "first-dentist-visit", ...order }) }))}>Create “First dentist visit”</button>
          <ul className="mt-4 divide-y text-sm">
            {stories.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2"><span className="font-medium">{s.title}</span><Pill s={s.status} />
                <span className="ml-auto flex gap-2">
                  <button className="rounded border px-2 py-0.5" onClick={() => act(() => api(`/api/stories/${s.id}`))}>Advance</button>
                  {(s.status === "images_ready" || s.status === "ready") && <button className="rounded bg-emerald-600 px-2 py-0.5 text-white" onClick={async () => { const r = await fetch(`/api/stories/${s.id}/pdf`, { headers: token ? { "x-admin-token": token } : {} }); if (!r.ok) return setMsg((await r.json()).error); window.open(URL.createObjectURL(await r.blob())); load(); }}>PDF</button>}
                </span></li>
            ))}
            {!stories.length && <li className="py-3 text-slate-500">No stories yet.</li>}
          </ul>
        </Card>
      </div>

      <Card title={`Tasks — ${stats.total} total · ${stats.completed} completed · ${stats.failed} failed · ${stats.running} running`}>
        <ul className="divide-y text-sm">
          {tasks.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-100 px-1.5 text-xs">{t.type}</span><Pill s={t.status} />{t.status === "processing" && <span className="text-xs">{t.progress}%</span>}<span className="truncate text-slate-600">{t.prompt}</span><span className="ml-auto text-xs text-slate-400">{t.created_at}</span></div>
              {t.urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-indigo-700 underline">{u}</a>)}
              {t.error && <p className="text-xs text-rose-700">{t.error}</p>}
              {t.note && <p className="text-xs text-amber-700">{t.note}{t.provider_task_id ? ` · provider task ${t.provider_task_id.slice(0, 12)}…` : ""}</p>}
            </li>
          ))}
          {!tasks.length && <li className="py-3 text-slate-500">No tasks yet.</li>}
        </ul>
      </Card>
    </main>
  );
}
