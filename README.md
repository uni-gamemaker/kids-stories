# Kids Stories Studio

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
`list_story_templates`, `create_story`, `get_story`.

## Setup
1. `cp .env.example .env` and fill in `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `MERGER_API_BASE`
   (and set `MCP_ACCESS_TOKEN` + `ADMIN_TOKEN` in production). **Never commit `.env`.**
2. `npm install && npm run dev`, open the dashboard, add your kie.ai / CometAPI keys (tried in the order added).
3. Deploy `merger/` as its own Vercel project (root directory `merger/`, env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
4. Point your MCP client at `https://<app>/mcp`.

## Tests (all offline: local libSQL file + mock providers)
`npm test` · `npm run test:mcp` · `npm run test:integration` · `cd merger && npm test`

## Known limits
See "Not verified yet" in the project hand-off notes: live provider calls (kie.ai field names, CometAPI video route)
and real Turso/Vercel behaviour still need a check with real credentials.
