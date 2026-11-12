# Daily short-video pipeline (your own stories)

```
 your story  ──►  AI app (scheduled task)  ──►  this MCP server  ──►  kie.ai (images + video)
 (queue in DB)        │                              │
                      │                              └─► merger/ (joins 4 clips into ~1 minute)
                      └─► publishing connector (e.g. Metricool) ──► Facebook / YouTube / TikTok / Instagram
```

The AI app is the "brain": it reads the next story from the queue, calls the tools below, and schedules the post.
This server is the "hands": it generates and merges media and remembers every episode in the database.

## Tools the AI app can use
| Tool | Purpose |
|---|---|
| `save_episode` / `list_episodes` / `get_episode` | The queue of your stories + memory of everything already made (no repeats) |
| `generate_image` | One illustration per scene (keeps the character look) |
| `generate_video` | 15-second clip per scene; pass the scene image as `image_url`; dialogue in the prompt is spoken |
| `get_task` | Poll any image/video/merge job until it is completed |
| `merge_videos` | Join the clips in order (`task_ids` of the completed video tasks) |
| `list_media` | Re-find earlier results |

## Connect it (AI apps that cannot send a custom header)
Set `MCP_URL_SECRET` (a long random text) in Vercel → redeploy. Then the connector URL is:
`https://<your-app>.vercel.app/mcp/<MCP_URL_SECRET>`   (authentication: **none** — the secret is in the URL, plain `/mcp` is closed).
Anyone who learns that URL can spend your credits, so never share it. Rotate it by changing the variable.

## Put your stories in the queue
Tell the AI app: *"Add this story to the queue: <title> — <your full story>"*. It calls `save_episode` (status `planned`).
Stories are made oldest-first, then marked `published`. Check with *"show the queue"* (`list_episodes` status planned).

## The daily instruction (paste as the scheduled task / custom instruction)
```
You run my daily short-video routine using the "kids-stories" MCP tools. Work autonomously, do not ask me questions.

1. list_episodes(status="planned"). Take the FIRST one and get_episode it. If the queue is empty, stop and tell me
   "queue empty" — never invent a story. Also list_episodes() (recent) so the new episode differs in style from the last ones.
2. save_episode(episode_id, status="generating").
3. Split the story into exactly 4 consecutive scenes of 15 seconds each, with a small funny/emotional payoff in the last scene.
   Write ONE character sheet (species/age, face, hair, clothes, colours, art style) and paste it VERBATIM into every prompt
   so the characters look identical in all scenes. Save the plan: save_episode(episode_id, scenes=[...]).
4. For each scene: generate_image (aspect_ratio 9:16, character sheet + scene description, no text in the image),
   then generate_video with image_url = that image, duration 15, enable_audio true, aspect_ratio 9:16.
   Put the scene's spoken line in the video prompt. Start all scenes before waiting.
5. Poll get_task every ~10 seconds for every job until each is completed. If one fails, regenerate only that scene once.
   Never stop because of keys or balances — the server handles that.
6. merge_videos(task_ids=[scene1..scene4 video task ids], in order). Poll get_task until completed.
7. Write an English caption: a hook line, 1-2 sentences, 3-5 hashtags.
8. Publish with the publishing connector (Metricool): schedule the merged video link for the next slot
   (at least 2 minutes from now). The merged link is deleted after 24 hours, so schedule right away.
9. save_episode(episode_id, status="scheduled", caption, merge_task_id, video_url).
10. Reply with a 3-line report: title, video link, scheduled time.
```

## Notes
- Image→video keeps the character consistent far better than text→video, so always generate the image first.
- Each episode costs 4 images + 4 videos of credit. Test with one episode before scheduling twice a day.
- Merged videos live 24 hours on the merger; the AI app must hand the link to the publisher immediately.
