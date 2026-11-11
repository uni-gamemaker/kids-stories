const { send, jobId, handler } = require("../../../lib/http");
const { processJob } = require("../../../lib/jobs");
module.exports = handler(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  const r = await processJob(jobId(req), `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`);
  send(res, r.code, r.body);
});
