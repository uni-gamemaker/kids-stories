# merger/ — Video Merger (site + API)

Joins 2–10 clips (direct links and/or uploaded files) into one MP4. Plain Node.js (CommonJS) Vercel functions,
Turso for storage (chunked blobs), ffmpeg via `ffmpeg-static`. Jobs and files are deleted after 24 hours.

Endpoints: `POST /api/jobs` · `POST /api/upload?job&seq&chunk` · `POST /api/jobs/:id/process` ·
`GET /api/jobs/:id` · `GET /api/jobs/:id/video` (Range supported) · `DELETE /api/jobs/:id` · `GET /api/config` · `GET /api/cron`.

Local: `TURSO_DATABASE_URL=file:./dev.db node server.js` then open http://localhost:3100.
Deploy: new Vercel project with root directory `merger/`; set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
(optional `CRON_SECRET`, `MAX_FILE_MB`, `MAX_TOTAL_MB`, `MAX_TOTAL_SECONDS`).
Tests: `npm test` (real ffmpeg, needs no network).
