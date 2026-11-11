const { send, readJson, handler } = require("../../lib/http");
const { createJob } = require("../../lib/jobs");
module.exports = handler(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  send(res, 201, await createJob(await readJson(req)));
});
