


# Kids Stories Studio

> **Main use: the daily short-video pipeline** — your own stories → 4 clips of 15 s → one ~1 minute video → auto-posted. See [`docs/VIDEO-PIPELINE.md`](docs/VIDEO-PIPELINE.md). The illustrated-PDF story engine below is optional/legacy.

Personalized, illustrated children's stories (PDF), generated through an **MCP media server**
(kie.ai + CometAPI, automatic sequential multi-key failover) plus a **video merger** (`merger/`).

* Hero: **Adam**, a fully fictional stylized cartoon boy (no photo input, no real-child likeness).
  The child's name from the order form replaces "Adam" later.
* Story no. 1 of the series: **"First Visit to the Dentist"** (cover + 10 pages).
* Everything is in English (dashboard LTR, tool replies, stories).

## Layout

| Path | What |
|---|---|
| `src/app/mcp` | MCP endpoint (stateless Streamable HTTP) |
| `src/app/api/*` | Dashboard API: keys, tasks, stories, PDF, health |
| `src/lib/generation.ts` | Coordinator: sequential key failover, "never stop" semantics |
| `src/lib/story/*` | Character sheet, story templates, engine, PDF assembly |
| `merger/` | Video merging site + public API (separate Vercel project, root dir `merger/`) |

## MCP tools
`generate_image`, `generate_video`, `merge_videos`, `get_task`, `list_media`,
`list_story_templates`, `create_story`, `get_story` (PDF engine), and `save_episode`, `list_episodes`, `get_episode` (video queue/memory).

## Setup
1. `cp .env.example .env` and fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `MERGER_API_BASE`
   (and set `ADMIN_TOKEN` plus either `MCP_URL_SECRET` (for ChatGPT/Claude connectors) or `MCP_ACCESS_TOKEN` in production). **Never commit `.env`.**
2. `npm install && npm run dev`, open the dashboard, add your kie.ai / CometAPI keys (tried in the order added).
3. Deploy `merger/` as its own Vercel project (root directory `merger/`, env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
4. Point your MCP client at `https://<app>/mcp`.

## Tests (all offline: local libSQL file + mock providers)
`npm test` · `npm run test:mcp` · `npm run test:integration` · `cd merger && npm test`

## Known limits
See "Not verified yet" in the project hand-off notes: live provider calls (kie.ai field names, CometAPI video route)
and real Turso/Vercel behaviour still need a check with real credentials.

