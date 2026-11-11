const { send, jobId, handler } = require("../../../lib/http");
const { getJob, view, deleteJobData } = require("../../../lib/jobs");
const base = (req) => `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
module.exports = handler(async (req, res) => {
  const id = jobId(req);
  const j = id && (await getJob(id));
  if (!j) return send(res, 404, { error: "Job not found (it may have expired after 24 hours)." });
  if (req.method === "DELETE") { await deleteJobData(id); return send(res, 200, { deleted: true }); }
  if (req.method !== "GET") return send(res, 405, { error: "Use GET or DELETE." });
  send(res, 200, view(j, base(req)));
});
