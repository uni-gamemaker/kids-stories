# Daily short-video pipeline (stories written by AI from your theme)

```
 your theme (series brief in DB) ─► MiniMax Code (scheduled task) ─► this MCP server ─► kie.ai (images + video)
                                          │                              └─► merger/ (joins 4 clips ≈ 1 minute)
                                          └─► Metricool MCP ─► Facebook · YouTube Shorts · TikTok · Instagram
```
The AI app is the brain (writes the story, calls tools, schedules the post). This server is the hands
(generates + merges media) and the memory (series brief + every episode, so nothing repeats).

## Tools
| Tool | Purpose |
|---|---|
| `set_series_brief` / `get_series_brief` | Your theme, hero, style, rules. Read first in every run |
| `save_episode` / `list_episodes` / `get_episode` | Memory of every episode (+ an optional queue of stories you write yourself) |
| `generate_image` → `generate_video` → `get_task` | Scene image, then 15-second clip from it (`image_url`), then poll |
| `merge_videos` | Join the 4 clips in order into one video |

## One-time setup
1. **Main app (Vercel)** → Settings → Environment Variables: `MCP_ACCESS_TOKEN` (long random text), plus the Turso ones. Redeploy.
2. **Merger (second Vercel project)**: import the same GitHub repo, set *Root Directory* = `merger`, add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
   Copy its address into the main app as `MERGER_API_BASE`, redeploy. Check `https://<main-app>/api/health` → `merger.healthy: true`.
3. **MiniMax Code** → plugin management → *MCP Servers* → add (or edit `~/.minimax/mcp.json`):
```json
{
  "mcpServers": {
    "kids-stories": {
      "type": "streamable-http",
      "url": "https://<main-app>.vercel.app/mcp",
      "headers": { "Authorization": "Bearer <MCP_ACCESS_TOKEN>" },
      "timeout": 120000,
      "description": "Story video generator"
    },
    "metricool": { "type": "streamable-http", "url": "https://ai.metricool.com/mcp", "description": "Social posting" }
  }
}
```
   Use *test connection*. Metricool asks you to sign in; connect your Facebook, YouTube, TikTok and Instagram inside Metricool first.
4. Save your theme once (paste into a MiniMax Code chat): *"Call set_series_brief with this text: …"* — see the starter below.

## Series brief starter (edit it — it is YOUR theme)
```
SERIES: Short kids' story videos, about 1 minute, English.
HERO: Adam, a fully fictional cartoon boy, about 6: big warm brown eyes, rosy cheeks, gap-toothed smile, wavy dark-brown hair
with a cowlick, yellow t-shirt with a white star, blue overalls, red sneakers. Soft 3D-cartoon children's-book look, warm colours.
THEME: gentle, funny stories about everyday firsts and small worries (first dentist visit, first day of school, losing a tooth,
sharing toys...) that end reassuringly. Always one clear lesson, never scary, nothing violent.
FORMAT: vertical 9:16, 4 scenes x 15 seconds, spoken English narration/dialogue in the video, no on-screen text.
PLATFORMS: Facebook, YouTube Shorts, TikTok, Instagram. Posting slots: 10:00 and 17:00 local time.
RULES: every episode must be a NEW situation (check list_episodes); keep Adam's look identical in every scene.
```

## The daily instruction (paste as the scheduled task, twice a day)
```
You run my daily short-video routine with the "kids-stories" MCP tools (and Metricool for posting). Work alone, do not ask questions.

1. get_series_brief and follow it. list_episodes(status="planned"): if there is a queued story, use the FIRST one (get_episode).
   Otherwise list_episodes() (the last 30) and invent a NEW story from the brief that is clearly different from all of them.
2. save_episode(title, summary, story_text, status="generating") for a new story, or update the queued one.
3. Split the story into exactly 4 consecutive scenes of 15 seconds with a warm payoff in scene 4. Reuse the hero's character
   sheet from the brief VERBATIM in every image and video prompt. save_episode(episode_id, scenes=[...]).
4. For each scene: generate_image (aspect_ratio 9:16, character sheet + scene, no text in the image), then generate_video with
   image_url = that image, duration 15, enable_audio true, aspect_ratio 9:16, the scene's spoken line inside the prompt.
   Start all four scenes before waiting.
5. Poll get_task every ~10 seconds until every job is completed. If one fails, regenerate only that scene once. Never stop because
   of keys or balances — the server handles that.
6. merge_videos(task_ids=[scene 1..4 video task ids], in order); poll get_task until completed.
7. Write one English caption (hook line, 1-2 sentences, 3-5 hashtags).
8. With Metricool, schedule the merged video link to Facebook, YouTube Shorts, TikTok and Instagram for the next free slot
   (at least 2 minutes from now). The merged link is deleted after 24 hours, so schedule immediately.
9. save_episode(episode_id, status="scheduled", caption, merge_task_id, video_url).
10. Reply with 3 lines: title, video link, scheduled time. If anything failed, say exactly which step and the error text.
```

## Things to know
- **MiniMax Code scheduled tasks only run while the desktop app is awake**, so the laptop must be on (not asleep) at 10:00 and 17:00.
- Each episode costs 4 images + 4 videos of kie.ai credit. Run ONE episode by hand and check the result before you schedule anything.
- Metricool's free plan allows about 20 scheduled posts per month; twice a day on four networks needs a paid plan (check how Metricool counts a post).
- The merged video is stored 24 hours; the publisher must receive the link right away.
